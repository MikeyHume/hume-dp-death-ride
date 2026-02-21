"""
Course Generator for DP Moto Rhythm Mode.

Reads pre-computed beat data JSON and generates obstacle course layouts
for Easy/Normal/Hard difficulties. Uses adaptive regeneration to
maximize a 7-dimensional quality score (targeting 10.0).

KEY DESIGN: Beats are the PRIMARY spawn grid — every event lands exactly
on a beat timestamp (beat_sync = 10 by construction). The song is divided
into progressive sections with rising event quotas (difficulty_curve by
construction). A wave-pattern lane cursor sweeps all 4 lanes (flow +
lane_coverage by construction). Type selection uses controlled distribution
(type_variety by construction). Energy-weighted beat selection ensures
spawns concentrate in loud sections (energy_match by construction).

Usage:
  python scripts/generate_courses.py --track SPOTIFY_ID --difficulty normal
  python scripts/generate_courses.py --track SPOTIFY_ID --all-difficulties
  python scripts/generate_courses.py --track SPOTIFY_ID --difficulty hard --max-attempts 50

Output: public/courses/{trackId}/{difficulty}.json
"""

import argparse
import json
import math
import os
import random
import sys
from copy import deepcopy
from dataclasses import dataclass, field
from pathlib import Path
from typing import List, Optional, Tuple

# ─── Constants ────────────────────────────────────────────────────

LANE_COUNT = 4
LANE_CROSS_TIME_S = 0.3       # time for player to cross one lane
BEAT_SNAP_WINDOW_S = 0.100    # 100ms tolerance for beat_sync scoring
MIN_EVENT_GAP_S = 0.15        # minimum gap between any two events
ENERGY_WINDOW_S = 10.0        # window for energy match scoring
DIFFICULTY_CURVE_WINDOWS = 8  # number of time slices for curve scoring
INTRO_SKIP_S = 4.0            # skip first N seconds (let player settle in)
OUTRO_SKIP_S = 2.0            # stop spawning N seconds before end
NUM_SECTIONS = 8              # song divided into this many progressive sections

# Score weights (must sum to 1.0)
SCORE_WEIGHTS = {
    'beat_sync': 0.25,
    'flow': 0.20,
    'difficulty_curve': 0.15,
    'type_variety': 0.10,
    'lane_coverage': 0.10,
    'energy_match': 0.10,
    'cull_rate': 0.10,
}

# ─── Difficulty Presets ───────────────────────────────────────────

@dataclass
class DifficultyParams:
    # Which beats to consider (every Nth beat)
    beat_skip: int = 2
    # Max obstacles in a single beat cluster
    max_per_cluster: int = 2
    # Type probabilities (obstacle types only; pickups separate)
    crash_weight: float = 0.35
    car_weight: float = 0.30
    slow_weight: float = 0.15
    pickup_ratio: float = 0.25   # fraction of events that become pickups
    # Minimum safe lanes at any moment
    min_safe_lanes: int = 2
    # Target event density: fraction of eligible beats that get events
    density: float = 0.55
    # Progressive curve: section 0 gets this fraction of max density, section N-1 gets 1.0
    curve_start: float = 0.20
    # Energy gating: beats below this energy skip spawning entirely
    energy_floor: float = 0.12
    # Energy influence on beat selection (0=ignore, 1=fully proportional)
    energy_influence: float = 0.5
    # Wave sweep amplitude (how many lanes the wave covers per cycle)
    wave_amplitude: int = 3       # 0-3 = full sweep
    # Wave period in events (number of events per full wave cycle)
    wave_period: int = 12
    # Random perturbation on wave lane assignment (0=none, 1=fully random)
    wave_noise: float = 0.15
    # Cluster probability thresholds
    cluster2_energy: float = 0.65
    cluster3_energy: float = 0.82
    cluster2_prob: float = 0.45
    cluster3_prob: float = 0.25

DIFFICULTY_PRESETS = {
    'easy': DifficultyParams(
        beat_skip=4, max_per_cluster=1,
        crash_weight=0.25, car_weight=0.20, slow_weight=0.20, pickup_ratio=0.35,
        min_safe_lanes=3, density=0.55, curve_start=0.15,
        energy_floor=0.18, energy_influence=0.4,
        wave_amplitude=3, wave_period=10, wave_noise=0.15,
    ),
    'normal': DifficultyParams(
        beat_skip=2, max_per_cluster=2,
        crash_weight=0.35, car_weight=0.30, slow_weight=0.15, pickup_ratio=0.25,
        min_safe_lanes=2, density=0.55, curve_start=0.20,
        energy_floor=0.12, energy_influence=0.6,
        wave_amplitude=3, wave_period=14, wave_noise=0.15,
        cluster2_energy=0.65, cluster2_prob=0.45,
    ),
    'hard': DifficultyParams(
        beat_skip=1, max_per_cluster=3,
        crash_weight=0.45, car_weight=0.30, slow_weight=0.10, pickup_ratio=0.12,
        min_safe_lanes=1, density=0.55, curve_start=0.25,
        energy_floor=0.08, energy_influence=0.7,
        wave_amplitude=3, wave_period=16, wave_noise=0.20,
        cluster2_energy=0.55, cluster2_prob=0.55, cluster3_energy=0.75, cluster3_prob=0.35,
    ),
}

# ─── Data Structures ─────────────────────────────────────────────

@dataclass
class CourseEvent:
    t: float       # time in seconds
    lane: int      # 0-3
    type: str      # 'crash', 'car', 'slow', 'pickup_ammo', 'pickup_shield', 'car_crash_beat', 'guardian'
    lead: Optional[float] = None  # pre-computed spawn lead time (used by car_crash_beat)

@dataclass
class ScoreBreakdown:
    beat_sync: float = 0.0
    flow: float = 0.0
    difficulty_curve: float = 0.0
    type_variety: float = 0.0
    lane_coverage: float = 0.0
    energy_match: float = 0.0
    cull_rate: float = 0.0

    @property
    def total(self) -> float:
        return (
            self.beat_sync * SCORE_WEIGHTS['beat_sync'] +
            self.flow * SCORE_WEIGHTS['flow'] +
            self.difficulty_curve * SCORE_WEIGHTS['difficulty_curve'] +
            self.type_variety * SCORE_WEIGHTS['type_variety'] +
            self.lane_coverage * SCORE_WEIGHTS['lane_coverage'] +
            self.energy_match * SCORE_WEIGHTS['energy_match'] +
            self.cull_rate * SCORE_WEIGHTS['cull_rate']
        )

    def to_dict(self) -> dict:
        return {
            'total': round(self.total, 2),
            'beat_sync': round(self.beat_sync, 2),
            'flow': round(self.flow, 2),
            'difficulty_curve': round(self.difficulty_curve, 2),
            'type_variety': round(self.type_variety, 2),
            'lane_coverage': round(self.lane_coverage, 2),
            'energy_match': round(self.energy_match, 2),
            'cull_rate': round(self.cull_rate, 2),
        }

# ─── Beat Data Helpers ───────────────────────────────────────────

def sample_at(arr: list, time_s: float, resolution_ms: int) -> float:
    """Sample a uint8 array at a given time, with linear interpolation. Returns 0-1."""
    if not arr:
        return 0.0
    idx = (time_s * 1000) / resolution_ms
    i0 = int(idx)
    i1 = i0 + 1
    if i0 < 0:
        return arr[0] / 255.0
    if i0 >= len(arr) - 1:
        return arr[-1] / 255.0
    frac = idx - i0
    return (arr[i0] * (1 - frac) + arr[i1] * frac) / 255.0


def find_nearest_beat(beats: list, t: float) -> float:
    """Find the nearest beat timestamp to t. Returns distance in seconds."""
    if not beats:
        return 999.0
    lo, hi = 0, len(beats) - 1
    while lo < hi:
        mid = (lo + hi) // 2
        if beats[mid] < t:
            lo = mid + 1
        else:
            hi = mid
    best = abs(beats[lo] - t)
    if lo > 0:
        best = min(best, abs(beats[lo - 1] - t))
    return best

# ─── Course Generation ───────────────────────────────────────────

def wave_lane(event_index: int, params: DifficultyParams, rng: random.Random) -> int:
    """
    Compute lane from a bounce pattern: [0,1,2,3,3,2,1,0] repeated.
    This gives perfectly even lane distribution (each lane visited exactly 2x per cycle)
    with smooth ±1 transitions and good flow.
    With small random perturbation for variety.
    """
    # Bounce pattern: up sweep then down sweep, each end held for 1 step
    # Distribution per cycle: lane 0=2, 1=2, 2=2, 3=2 (perfectly even)
    BOUNCE = [0, 1, 2, 3, 3, 2, 1, 0]
    base_lane = BOUNCE[event_index % len(BOUNCE)]

    # Add noise: small chance to shift ±1 lane
    if rng.random() < params.wave_noise:
        base_lane += rng.choice([-1, 1])

    return max(0, min(LANE_COUNT - 1, base_lane))


def pick_type(bass_val: float, perc_val: float, harm_val: float,
              params: DifficultyParams, rng: random.Random, is_pickup: bool) -> str:
    """Pick event type based on audio features at this beat."""
    if is_pickup:
        return 'pickup_ammo' if rng.random() > 0.3 else 'pickup_shield'

    # Obstacle type influenced by dominant audio band
    dominant = max(bass_val, perc_val, harm_val * 0.5)

    if dominant == bass_val and bass_val > 0.3:
        if rng.random() < 0.55:
            return 'crash'
    elif dominant == perc_val and perc_val > 0.3:
        if rng.random() < 0.45:
            return 'car'

    # Weighted random fallback
    roll = rng.random()
    total_w = params.crash_weight + params.car_weight + params.slow_weight
    if roll < params.crash_weight / total_w:
        return 'crash'
    elif roll < (params.crash_weight + params.car_weight) / total_w:
        return 'car'
    else:
        return 'slow'


def generate_events(beat_data: dict, params: DifficultyParams, rng: random.Random) -> List[CourseEvent]:
    """
    Generate course events using a structured approach:
    1. Beats as grid (beat_sync = 10)
    2. Progressive section quotas (difficulty_curve ≈ 10)
    3. Wave-pattern lanes (flow + lane_coverage ≈ 10)
    4. Energy-weighted beat selection (energy_match ≈ 10)
    5. Controlled type distribution (type_variety ≈ 10)
    6. Respect min_safe_lanes during generation (cull_rate ≈ 10)
    """
    res_ms = beat_data['resolution_ms']
    duration = beat_data['duration_s']
    beats = beat_data['beats']
    bass = beat_data['bands']['bass']
    perc = beat_data['percussive']
    harm = beat_data['harmonic']
    energy = beat_data['energy']

    # ── Step 1: Get candidate beats ─────────────────────────────
    playable_start = INTRO_SKIP_S
    playable_end = duration - OUTRO_SKIP_S
    candidate_beats = []
    for i, beat_time in enumerate(beats):
        if beat_time < playable_start or beat_time > playable_end:
            continue
        if i % params.beat_skip != 0:
            continue
        candidate_beats.append(beat_time)

    if not candidate_beats:
        return []

    # ── Step 2: Divide into sections with progressive quotas ────
    section_dur = (playable_end - playable_start) / NUM_SECTIONS
    sections = []  # list of (beat_times, quota)
    total_quota = 0

    # Pre-compute average energy per section for energy-scaled quotas
    section_energies = []
    for s in range(NUM_SECTIONS):
        s_start = playable_start + s * section_dur
        s_mid = s_start + section_dur / 2
        section_energies.append(sample_at(energy, s_mid, res_ms))
    avg_section_energy = sum(section_energies) / max(1, len(section_energies))

    for s in range(NUM_SECTIONS):
        s_start = playable_start + s * section_dur
        s_end = s_start + section_dur
        s_beats = [b for b in candidate_beats if s_start <= b < s_end]

        # Progressive quota: section 0 gets curve_start fraction, section N-1 gets 1.0
        progress = (s + 0.5) / NUM_SECTIONS  # center of section, 0.0625 to 0.9375
        quota_frac = params.curve_start + (1.0 - params.curve_start) * progress
        # Energy scaling: sections with above-average energy get boosted (±30% max)
        if avg_section_energy > 0:
            energy_scale = 0.7 + 0.6 * (section_energies[s] / max(0.01, avg_section_energy * 2))
        else:
            energy_scale = 1.0
        quota = max(0, round(len(s_beats) * params.density * quota_frac * energy_scale))
        sections.append((s_beats, quota))
        total_quota += quota

    # ── Step 3: Within each section, select beats by energy ─────
    selected_beats = []
    for s_beats, quota in sections:
        if quota <= 0 or not s_beats:
            continue

        # Score each beat by energy (higher energy = more likely to be selected)
        scored = []
        for bt in s_beats:
            e_val = sample_at(energy, bt, res_ms)
            if e_val < params.energy_floor:
                continue
            # Energy-weighted score with random tiebreaker
            score = (1.0 - params.energy_influence) + params.energy_influence * e_val
            score += rng.random() * 0.1  # small random perturbation
            scored.append((bt, score, e_val))

        # Sort by score descending, take top 'quota' beats
        scored.sort(key=lambda x: -x[1])
        picked = scored[:quota]
        # Re-sort by time
        picked.sort(key=lambda x: x[0])
        selected_beats.extend(picked)

    # ── Step 4: Determine pickup vs obstacle per event ──────────
    # Distribute pickups evenly across the course
    n_events = len(selected_beats)
    n_pickups = max(1, round(n_events * params.pickup_ratio))
    # Space pickups evenly
    pickup_indices = set()
    if n_pickups > 0 and n_events > 0:
        spacing = n_events / n_pickups
        for i in range(n_pickups):
            idx = min(n_events - 1, round(i * spacing + rng.random() * spacing * 0.4))
            pickup_indices.add(idx)

    # ── Step 5: Assign lanes (wave pattern) and types ───────────
    # KEY: Obstacles use their own wave counter so the bounce pattern is
    # continuous regardless of interspersed pickups. This prevents pickups
    # from creating lane-jump gaps in the obstacle flow sequence.
    events: List[CourseEvent] = []
    BOUNCE = [0, 1, 2, 3, 3, 2, 1, 0]
    wave_offset = rng.randint(0, len(BOUNCE) - 1)
    obstacle_wave_idx = 0  # only increments for obstacle beats
    lane_counts = [0] * LANE_COUNT  # track usage for cluster lane balancing

    for i, (beat_time, score, e_val) in enumerate(selected_beats):
        bass_val = sample_at(bass, beat_time, res_ms)
        perc_val = sample_at(perc, beat_time, res_ms)
        harm_val = sample_at(harm, beat_time, res_ms)

        is_pickup = i in pickup_indices

        if is_pickup:
            # Pickups go on the least-used lane (helps lane_coverage)
            pickup_lane = min(range(LANE_COUNT), key=lambda l: (lane_counts[l], rng.random()))
            etype = 'pickup_ammo' if rng.random() > 0.3 else 'pickup_shield'
            events.append(CourseEvent(t=round(beat_time, 3), lane=pickup_lane, type=etype))
            lane_counts[pickup_lane] += 1
        else:
            # Obstacles follow the wave pattern
            cluster_size = 1
            if params.max_per_cluster >= 2 and e_val > params.cluster2_energy:
                if rng.random() < params.cluster2_prob:
                    cluster_size = 2
            if params.max_per_cluster >= 3 and e_val > params.cluster3_energy:
                if rng.random() < params.cluster3_prob:
                    cluster_size = 3

            primary_lane = wave_lane(obstacle_wave_idx + wave_offset, params, rng)
            chosen_lanes = [primary_lane]

            if cluster_size > 1:
                available = [l for l in range(LANE_COUNT) if l != primary_lane]
                # Prefer adjacent lanes (improves flow), then least-used for balance
                available.sort(key=lambda l: (abs(l - primary_lane), lane_counts[l]))
                max_obstacles = LANE_COUNT - params.min_safe_lanes
                extra = min(cluster_size - 1, max_obstacles - 1, len(available))
                chosen_lanes.extend(available[:extra])

            for lane in chosen_lanes:
                etype = pick_type(bass_val, perc_val, harm_val, params, rng, False)
                events.append(CourseEvent(t=round(beat_time, 3), lane=lane, type=etype))
                lane_counts[lane] += 1

            obstacle_wave_idx += 1

    return events

# ─── Path Validation ──────────────────────────────────────────────

def validate_paths(events: List[CourseEvent], params: DifficultyParams) -> Tuple[List[CourseEvent], int]:
    """
    Validate that at least min_safe_lanes lanes are reachable at every event time.
    Culls events that create impossible states.
    Returns (validated_events, cull_count).
    """
    if not events:
        return events, 0

    validated = []
    cull_count = 0

    # Group events by time (events at same time form a "wall")
    time_groups: List[Tuple[float, List[CourseEvent]]] = []
    current_group_time = -999.0
    current_group: List[CourseEvent] = []

    for e in sorted(events, key=lambda x: x.t):
        if abs(e.t - current_group_time) < 0.05:  # within 50ms = same group
            current_group.append(e)
        else:
            if current_group:
                time_groups.append((current_group_time, current_group))
            current_group_time = e.t
            current_group = [e]
    if current_group:
        time_groups.append((current_group_time, current_group))

    for gi, (group_time, group_events) in enumerate(time_groups):
        # Separate pickups from obstacles
        pickup_events = []
        obstacle_events = []
        blocked_lanes = set()
        for e in group_events:
            if e.type.startswith('pickup'):
                pickup_events.append(e)
            else:
                blocked_lanes.add(e.lane)
                obstacle_events.append(e)

        safe_lanes = LANE_COUNT - len(blocked_lanes)

        # Enforce minimum safe lanes
        if safe_lanes < params.min_safe_lanes:
            while safe_lanes < params.min_safe_lanes and obstacle_events:
                removed = obstacle_events.pop()
                blocked_lanes.discard(removed.lane)
                safe_lanes = LANE_COUNT - len(blocked_lanes)
                cull_count += 1

        # Check reachability from previous group
        if gi > 0:
            prev_time = time_groups[gi - 1][0]
            time_gap = group_time - prev_time
            max_lane_change = int(time_gap / LANE_CROSS_TIME_S)

            prev_blocked = set()
            for e in time_groups[gi - 1][1]:
                if not e.type.startswith('pickup'):
                    prev_blocked.add(e.lane)
            prev_safe = set(range(LANE_COUNT)) - prev_blocked
            current_safe = set(range(LANE_COUNT)) - blocked_lanes

            reachable = False
            for prev_lane in prev_safe:
                for curr_lane in current_safe:
                    if abs(curr_lane - prev_lane) <= max_lane_change:
                        reachable = True
                        break
                if reachable:
                    break

            if not reachable and obstacle_events:
                while not reachable and obstacle_events:
                    removed = obstacle_events.pop()
                    blocked_lanes.discard(removed.lane)
                    current_safe = set(range(LANE_COUNT)) - blocked_lanes
                    for prev_lane in prev_safe:
                        for curr_lane in current_safe:
                            if abs(curr_lane - prev_lane) <= max_lane_change:
                                reachable = True
                                break
                        if reachable:
                            break
                    cull_count += 1

        validated.extend(obstacle_events)
        validated.extend(pickup_events)

    validated.sort(key=lambda e: e.t)
    return validated, cull_count

# ─── Rhythm Zone Post-Processing ─────────────────────────────────
# Must match TypeScript tuning constants
GAME_WIDTH = 1920
OBSTACLE_SPAWN_MARGIN = 120
KILL_ZONE_X = 200
ROAD_BASE_SPEED = 1000
CAR_SPEED_FACTOR = 0.65  # cars move at 35% of road speed

SPAWN_X = GAME_WIDTH + OBSTACLE_SPAWN_MARGIN  # 2040
CAR_SPEED = ROAD_BASE_SPEED * (1 - CAR_SPEED_FACTOR)  # 350 px/s
CAR_LEAD_TIME = (SPAWN_X - KILL_ZONE_X) / CAR_SPEED  # ~5.26s
SWEET_SPOT_X = 960
ENEMY_CAR_LEAD_TIME = (SPAWN_X - SWEET_SPOT_X) / CAR_SPEED  # ~3.09s


def add_car_crash_beats(events: List[CourseEvent], beat_data: dict, rng: random.Random,
                        car_crash_prob: float = 0.35) -> List[CourseEvent]:
    """
    Post-process: for some car events, add a car_crash_beat that sends a CRASH
    to intercept the car mid-screen, creating an on-beat explosion fake-out.

    The car's event time (car_t) is when it reaches the kill zone (x=200).
    So the car is visible on-screen from about car_t - 5s to car_t.
    We pick a collision beat 1-3 seconds before car_t (car is mid-screen).
    """
    beats = beat_data['beats']
    car_events = [e for e in events if e.type == 'car']
    new_events = []

    for car_ev in car_events:
        if rng.random() > car_crash_prob:
            continue

        car_t = car_ev.t

        # Find beats 1-3 seconds before car_t (car is mid-screen then)
        candidate_beats = [b for b in beats if 1.0 <= car_t - b <= 3.0]
        if not candidate_beats:
            continue

        # Pick the beat closest to 2 seconds before car_t
        collision_t = min(candidate_beats, key=lambda b: abs((car_t - b) - 2.0))

        # Compute car's X position at collision_t
        # At car_t, car is at x=200 (kill zone). Car moves left at CAR_SPEED px/s.
        # At collision_t (before car_t), car is further right.
        time_before_kz = car_t - collision_t
        car_x_at_collision = KILL_ZONE_X + CAR_SPEED * time_before_kz

        # Compute CRASH lead time: how long for CRASH to travel from spawn to car_x
        crash_travel = SPAWN_X - car_x_at_collision
        if crash_travel <= 0:
            continue
        crash_lead = crash_travel / ROAD_BASE_SPEED

        new_events.append(CourseEvent(
            t=round(collision_t, 3),
            lane=car_ev.lane,
            type='car_crash_beat',
            lead=round(crash_lead, 3),
        ))

    events.extend(new_events)
    events.sort(key=lambda e: e.t)
    return events


def add_guardians(events: List[CourseEvent], rng: random.Random,
                  guardian_prob: float = 0.5) -> List[CourseEvent]:
    """
    Post-process: for some pickup events, insert a guardian obstacle ahead of the
    pickup in the same lane. The guardian is a tinted CRASH that the player must
    slash to reach the ammo — closer to screen center = higher score.

    Guardian spawns ~0.5-1.0 seconds before the pickup (same lane, same beat grid).
    """
    pickup_events = [(i, e) for i, e in enumerate(events) if e.type == 'pickup_ammo']
    new_guardians = []

    for idx, pickup_ev in pickup_events:
        if rng.random() > guardian_prob:
            continue

        # Guardian spawns slightly before the pickup (same beat grid alignment)
        # Offset by 0.3-0.8 seconds — enough for player to see and react
        offset = 0.3 + rng.random() * 0.5
        guardian_t = round(pickup_ev.t - offset, 3)
        if guardian_t < INTRO_SKIP_S:
            continue

        new_guardians.append(CourseEvent(
            t=guardian_t,
            lane=pickup_ev.lane,
            type='guardian',
        ))

    events.extend(new_guardians)
    events.sort(key=lambda e: e.t)
    return events


def add_enemy_cars(events: List[CourseEvent], beat_data: dict, rng: random.Random,
                   enemy_prob: float = 0.25) -> List[CourseEvent]:
    """
    Post-process: convert some car events into enemy_car events.
    Enemy cars are timed to reach the sweet spot (x=960) on a beat.

    Since CourseRunner uses a separate enemyCarLeadTime for enemy_car,
    the event 't' means "when the car should be at the sweet spot".
    We snap car events to the nearest beat for the enemy_car timing.
    """
    beats = beat_data['beats']
    car_events = [e for e in events if e.type == 'car']

    for car_ev in car_events:
        if rng.random() > enemy_prob:
            continue

        # Don't convert cars that already have a car_crash_beat targeting them
        has_crash_beat = any(
            e.type == 'car_crash_beat' and e.lane == car_ev.lane
            and abs(e.t - car_ev.t) < 4.0
            for e in events
        )
        if has_crash_beat:
            continue

        # Original car_t = when car reaches kill zone (x=200).
        # At kill zone, the car has been on screen for a while.
        # The car reaches the sweet spot (x=960) at:
        #   sweet_t = car_t - (960 - 200) / 350 = car_t - 2.17s
        sweet_arrival = car_ev.t - (SWEET_SPOT_X - KILL_ZONE_X) / CAR_SPEED

        # Snap to nearest beat
        if not beats:
            continue
        snap_t = min(beats, key=lambda b: abs(b - sweet_arrival))
        # Only accept if snap is within 0.5 beats of the natural arrival
        if abs(snap_t - sweet_arrival) > 0.5:
            continue

        # Convert to enemy_car with the beat-snapped time
        car_ev.type = 'enemy_car'
        car_ev.t = round(snap_t, 3)

    events.sort(key=lambda e: e.t)
    return events


# ─── Scoring ──────────────────────────────────────────────────────

def compute_scores(events: List[CourseEvent], beat_data: dict, cull_count: int, total_generated: int) -> ScoreBreakdown:
    """Compute 7 sub-scores for a course."""
    scores = ScoreBreakdown()
    if not events:
        return scores

    beats = beat_data['beats']
    duration = beat_data['duration_s']
    res_ms = beat_data['resolution_ms']
    energy = beat_data['energy']

    all_events = events
    obstacle_events = [e for e in events if not e.type.startswith('pickup')]

    # 1. Beat Sync: % of events within BEAT_SNAP_WINDOW_S of a beat
    if all_events:
        synced = sum(1 for e in all_events if find_nearest_beat(beats, e.t) <= BEAT_SNAP_WINDOW_S)
        scores.beat_sync = min(10.0, (synced / len(all_events)) * 10.0)

    # 2. Flow: smoothness of lane transitions between TIME GROUPS
    # Measures: (a) step sizes should be small, (b) reversals should be infrequent
    # A bounce sweep pattern (0→3→0) should score ~9.5 since it feels smooth to the player
    if len(obstacle_events) >= 3:
        # Group by time, take FIRST lane per group (= primary wave lane)
        flow_groups = []
        current_t = -999.0
        first_lane = -1
        for e in sorted(obstacle_events, key=lambda x: x.t):
            if abs(e.t - current_t) < 0.05:
                pass  # skip additional cluster members
            else:
                if first_lane >= 0:
                    flow_groups.append(first_lane)
                current_t = e.t
                first_lane = e.lane
        if first_lane >= 0:
            flow_groups.append(first_lane)

        if len(flow_groups) >= 3:
            small_steps = 0      # |diff| <= 1
            total_transitions = 0
            reversals = 0
            directional_moves = 0
            prev_dir = 0
            for i in range(1, len(flow_groups)):
                diff = flow_groups[i] - flow_groups[i - 1]
                total_transitions += 1
                if abs(diff) <= 1:
                    small_steps += 1
                if diff != 0:
                    direction = 1 if diff > 0 else -1
                    directional_moves += 1
                    if prev_dir != 0 and direction != prev_dir:
                        reversals += 1
                    prev_dir = direction

            step_score = small_steps / max(1, total_transitions)  # 1.0 = all moves are small
            reversal_rate = reversals / max(1, directional_moves)
            # Gentle reversal penalty: periodic bouncing is fine (1 reversal per ~6 moves = 0.17)
            reversal_penalty = reversal_rate * 0.4  # 17% reversal → 0.068 penalty

            raw = step_score - reversal_penalty
            scores.flow = min(10.0, max(0.0, raw * 10.5))
        else:
            scores.flow = 10.0
    elif len(obstacle_events) <= 2:
        scores.flow = 10.0
    else:
        scores.flow = 8.0

    # 3. Difficulty Curve: correlation of density with time
    if obstacle_events and duration > 0:
        window_dur = duration / DIFFICULTY_CURVE_WINDOWS
        densities = []
        for w in range(DIFFICULTY_CURVE_WINDOWS):
            t_start = w * window_dur
            t_end = (w + 1) * window_dur
            count = sum(1 for e in obstacle_events if t_start <= e.t < t_end)
            densities.append(count)

        if sum(densities) > 0:
            indices = list(range(len(densities)))
            corr = pearson_correlation(indices, densities)
            scores.difficulty_curve = min(10.0, max(0.0, (corr + 1) * 5.0))
        else:
            scores.difficulty_curve = 0.0

    # 4. Type Variety: Shannon entropy of types
    if all_events:
        type_counts = {}
        for e in all_events:
            t = 'pickup' if e.type.startswith('pickup') else e.type
            type_counts[t] = type_counts.get(t, 0) + 1
        total = len(all_events)
        num_types = len(type_counts)
        if num_types > 1:
            entropy = -sum((c / total) * math.log2(c / total) for c in type_counts.values())
            max_entropy = math.log2(min(num_types, 4))  # crash, car, slow, pickup
            scores.type_variety = min(10.0, (entropy / max_entropy) * 10.0)
        else:
            scores.type_variety = 2.0

    # 5. Lane Coverage: evenness of lane usage
    if all_events:
        lane_counts = [0] * LANE_COUNT
        for e in all_events:
            lane_counts[e.lane] += 1
        total = sum(lane_counts)
        if total > 0:
            expected = total / LANE_COUNT
            deviation = sum((c - expected) ** 2 for c in lane_counts) / expected
            scores.lane_coverage = min(10.0, max(0.0, 10.0 - deviation * 2.0))

    # 6. Energy Match: correlation between spawn density and audio energy
    if all_events and duration > 0:
        num_windows = max(2, int(duration / ENERGY_WINDOW_S))
        window_dur = duration / num_windows
        spawn_densities = []
        energy_averages = []
        for w in range(num_windows):
            t_start = w * window_dur
            t_end = (w + 1) * window_dur
            spawn_count = sum(1 for e in all_events if t_start <= e.t < t_end)
            spawn_densities.append(spawn_count)
            i_start = int(t_start * 1000 / res_ms)
            i_end = int(t_end * 1000 / res_ms)
            i_start = max(0, min(i_start, len(energy) - 1))
            i_end = max(i_start + 1, min(i_end, len(energy)))
            avg_e = sum(energy[i_start:i_end]) / max(1, i_end - i_start)
            energy_averages.append(avg_e)

        if len(spawn_densities) >= 2:
            corr = pearson_correlation(spawn_densities, energy_averages)
            scores.energy_match = min(10.0, max(0.0, (corr + 1) * 5.0))
        else:
            scores.energy_match = 5.0

    # 7. Cull Rate: penalty for culled events
    if total_generated > 0:
        cull_ratio = cull_count / total_generated
        scores.cull_rate = min(10.0, max(0.0, 10.0 - cull_ratio * 33.3))
    else:
        scores.cull_rate = 10.0

    return scores


def pearson_correlation(x: list, y: list) -> float:
    """Compute Pearson correlation coefficient."""
    n = len(x)
    if n < 2:
        return 0.0
    mean_x = sum(x) / n
    mean_y = sum(y) / n
    num = sum((x[i] - mean_x) * (y[i] - mean_y) for i in range(n))
    den_x = math.sqrt(sum((x[i] - mean_x) ** 2 for i in range(n)))
    den_y = math.sqrt(sum((y[i] - mean_y) ** 2 for i in range(n)))
    if den_x == 0 or den_y == 0:
        return 0.0
    return num / (den_x * den_y)

# ─── Adaptive Parameter Adjustment ───────────────────────────────

def adjust_params(params: DifficultyParams, scores: ScoreBreakdown) -> DifficultyParams:
    """Adjust generation params based on score deficits."""
    p = deepcopy(params)

    if scores.flow < 9.5:
        deficit = 10 - scores.flow
        # Reduce wave noise for smoother sweeps
        p.wave_noise = max(0.0, p.wave_noise - 0.02 * deficit)
        # Slightly increase period (longer arcs)
        p.wave_period = min(24, p.wave_period + 1)

    if scores.difficulty_curve < 9.0:
        deficit = 10 - scores.difficulty_curve
        # Lower curve_start so early sections are sparser
        p.curve_start = max(0.02, p.curve_start - 0.02 * deficit)

    if scores.type_variety < 9.0:
        deficit = 10 - scores.type_variety
        # Push obstacle weights toward equality
        avg_w = (p.crash_weight + p.car_weight + p.slow_weight) / 3.0
        p.crash_weight += (avg_w - p.crash_weight) * 0.08 * deficit
        p.car_weight += (avg_w - p.car_weight) * 0.08 * deficit
        p.slow_weight += (avg_w - p.slow_weight) * 0.08 * deficit
        p.pickup_ratio = max(0.08, min(0.45, p.pickup_ratio + 0.01 * deficit))

    if scores.lane_coverage < 9.0:
        deficit = 10 - scores.lane_coverage
        # Ensure full wave amplitude
        p.wave_amplitude = LANE_COUNT - 1
        # Reduce noise (less deviation from even sweep)
        p.wave_noise = max(0.0, p.wave_noise - 0.02 * deficit)

    if scores.energy_match < 9.0:
        deficit = 10 - scores.energy_match
        p.energy_influence = min(0.95, p.energy_influence + 0.06 * deficit)
        p.energy_floor = min(0.35, p.energy_floor + 0.02 * deficit)

    if scores.cull_rate < 9.5:
        deficit = 10 - scores.cull_rate
        p.density = max(0.25, p.density - 0.02 * deficit)
        p.cluster2_prob = max(0.05, p.cluster2_prob - 0.03 * deficit)
        p.cluster3_prob = max(0.02, p.cluster3_prob - 0.03 * deficit)

    return p

# ─── Main Generation Loop ────────────────────────────────────────

def generate_course(beat_data: dict, difficulty: str, max_attempts: int = 50,
                    target_score: float = 9.60, verbose: bool = False) -> dict:
    """Generate a course with adaptive regeneration targeting the highest score."""
    base_params = deepcopy(DIFFICULTY_PRESETS[difficulty])
    params = deepcopy(base_params)

    champion_events = None
    champion_score = ScoreBreakdown()
    champion_seed = 0
    champion_attempts = 0

    for attempt in range(max_attempts):
        seed = attempt + 1
        rng = random.Random(seed)

        events = generate_events(beat_data, params, rng)
        total_generated = len(events)
        events, cull_count = validate_paths(events, params)
        scores = compute_scores(events, beat_data, cull_count, total_generated)

        if verbose:
            print(f"  Attempt {attempt + 1}: {len(events)} events, "
                  f"score={scores.total:.2f} "
                  f"(bs={scores.beat_sync:.1f} fl={scores.flow:.1f} "
                  f"dc={scores.difficulty_curve:.1f} tv={scores.type_variety:.1f} "
                  f"lc={scores.lane_coverage:.1f} em={scores.energy_match:.1f} "
                  f"cr={scores.cull_rate:.1f})")

        if scores.total > champion_score.total:
            champion_events = events
            champion_score = scores
            champion_seed = seed
            champion_attempts = attempt + 1

        if scores.total >= target_score:
            break

        # Adjust params for next attempt
        params = adjust_params(params, scores)

    # Post-processing: add rhythm zone event types to the champion
    if champion_events:
        post_rng = random.Random(champion_seed + 1000)
        champion_events = add_car_crash_beats(champion_events, beat_data, post_rng)
        champion_events = add_guardians(champion_events, post_rng)
        champion_events = add_enemy_cars(champion_events, beat_data, post_rng)

    track_id = beat_data.get('spotify_track_id', 'unknown')

    def event_to_dict(e: CourseEvent) -> dict:
        d = {'t': e.t, 'lane': e.lane, 'type': e.type}
        if e.lead is not None:
            d['lead'] = e.lead
        return d

    return {
        'spotify_track_id': track_id,
        'difficulty': difficulty,
        'name': 'Default',
        'duration_s': round(beat_data['duration_s'], 3),
        'bpm': beat_data['bpm'],
        'version': 1,
        'seed': champion_seed,
        'score': champion_score.to_dict(),
        'attempts': champion_attempts,
        'events': [event_to_dict(e) for e in (champion_events or [])],
    }

# ─── CLI ──────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description='Generate rhythm mode courses')
    parser.add_argument('--track', required=True, help='Spotify track ID')
    parser.add_argument('--difficulty', choices=['easy', 'normal', 'hard'],
                        help='Generate for one difficulty')
    parser.add_argument('--all-difficulties', action='store_true',
                        help='Generate for all difficulties')
    parser.add_argument('--max-attempts', type=int, default=50,
                        help='Max regeneration attempts')
    parser.add_argument('--target-score', type=float, default=9.60,
                        help='Target quality score')
    parser.add_argument('--verbose', '-v', action='store_true')
    parser.add_argument('--beat-dir', default='public/beat_data',
                        help='Directory containing beat data JSON files')
    parser.add_argument('--output-dir', default='public/courses',
                        help='Output directory for courses')
    args = parser.parse_args()

    # Load beat data
    beat_file = Path(args.beat_dir) / f'{args.track}.json'
    if not beat_file.exists():
        print(f"ERROR: Beat data not found: {beat_file}")
        sys.exit(1)

    with open(beat_file) as f:
        beat_data = json.load(f)

    # Ensure track ID is in beat data
    if 'spotify_track_id' not in beat_data:
        beat_data['spotify_track_id'] = args.track

    difficulties = ['easy', 'normal', 'hard'] if args.all_difficulties else [args.difficulty]
    if not args.all_difficulties and not args.difficulty:
        print("ERROR: Specify --difficulty or --all-difficulties")
        sys.exit(1)

    output_dir = Path(args.output_dir) / args.track
    output_dir.mkdir(parents=True, exist_ok=True)

    for diff in difficulties:
        print(f"\n{'='*60}")
        print(f"Generating {diff.upper()} course for {args.track}")
        print(f"{'='*60}")

        course = generate_course(
            beat_data, diff,
            max_attempts=args.max_attempts,
            target_score=args.target_score,
            verbose=args.verbose,
        )

        out_file = output_dir / f'{diff}.json'
        with open(out_file, 'w') as f:
            json.dump(course, f, indent=2)

        s = course['score']
        print(f"\nResult: {len(course['events'])} events, "
              f"score={s['total']:.2f} (after {course['attempts']} attempts)")
        print(f"  beat_sync={s['beat_sync']:.1f}  flow={s['flow']:.1f}  "
              f"curve={s['difficulty_curve']:.1f}  variety={s['type_variety']:.1f}")
        print(f"  coverage={s['lane_coverage']:.1f}  energy={s['energy_match']:.1f}  "
              f"cull_rate={s['cull_rate']:.1f}")
        print(f"Saved: {out_file}")


if __name__ == '__main__':
    main()
