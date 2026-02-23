#!/usr/bin/env node
/**
 * Skill Runner — Executes skills from the skill library against the test server.
 *
 * Usage:
 *   node scripts/skill-runner.mjs --skill avoid-nearest-threat --duration 10000
 *   node scripts/skill-runner.mjs --skill accelerate-burst --taps 20
 *   node scripts/skill-runner.mjs --skill survive-run --duration 30000
 *
 * Uses the Vite dev server's /test-state and /test-command endpoints.
 * Zero external dependencies.
 */

import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import https from 'node:https';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ── CLI args ────────────────────────────────────────────────────
const { values: args } = parseArgs({
  options: {
    'skill':    { type: 'string', default: '' },
    'host':     { type: 'string', default: 'localhost' },
    'port':     { type: 'string', default: '8081' },
    'duration': { type: 'string', default: '10000' },
    'y':        { type: 'string', default: '' },
    'taps':     { type: 'string', default: '' },
    'interval': { type: 'string', default: '' },
    'list':     { type: 'boolean', default: false },
  },
});

// ── Load skill library ──────────────────────────────────────────
const skillsPath = join(__dirname, 'skills', 'skills.json');
const skills = JSON.parse(readFileSync(skillsPath, 'utf-8'));

if (args.list) {
  console.log('\nAvailable skills:\n');
  for (const s of skills) {
    const params = s.params ? Object.keys(s.params).join(', ') : 'none';
    console.log(`  ${s.name.padEnd(24)} [tier ${s.tier}] ${s.description}`);
    if (params !== 'none') console.log(`${''.padEnd(26)} params: ${params}`);
  }
  console.log('');
  process.exit(0);
}

if (!args.skill) {
  console.error('Usage: node skill-runner.mjs --skill <name> [--duration ms] [--y num] [--taps num]');
  console.error('       node skill-runner.mjs --list');
  process.exit(1);
}

const HOST = args.host;
const PORT = parseInt(args.port, 10);
const DURATION = parseInt(args.duration, 10);

// ── Logging ─────────────────────────────────────────────────────
const log = (tag, msg) => console.log(`\x1b[36m[${tag}]\x1b[0m ${msg}`);
const warn = (tag, msg) => console.warn(`\x1b[33m[${tag}]\x1b[0m ${msg}`);

// ── HTTP helper ─────────────────────────────────────────────────
function httpReq(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const proto = PORT === 443 || PORT === 8081 ? https : http;
    const options = {
      hostname: HOST,
      port: PORT,
      path,
      method,
      headers: { 'Content-Type': 'application/json' },
      rejectUnauthorized: false,
    };
    const req = proto.request(options, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString();
        try { resolve(JSON.parse(raw)); } catch { resolve(raw); }
      });
    });
    req.on('error', reject);
    req.setTimeout(5000, () => req.destroy(new Error('timeout')));
    if (body) req.write(typeof body === 'string' ? body : JSON.stringify(body));
    req.end();
  });
}

// ── Server interaction ──────────────────────────────────────────
async function getState() {
  try {
    return await httpReq('GET', '/test-state');
  } catch {
    return null;
  }
}

async function sendCommand(cmd) {
  const cmdStr = typeof cmd === 'string' ? cmd : JSON.stringify(cmd);
  return httpReq('POST', '/test-command', { commands: [cmdStr] });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Param resolution ────────────────────────────────────────────
function resolveParams(skill) {
  const params = { ...skill.params };
  // Override from CLI
  if (args.y && 'y' in params) params.y = parseInt(args.y, 10);
  if (args.taps && 'taps' in params) params.taps = parseInt(args.taps, 10);
  if (args.interval && 'interval' in params) params.interval = parseInt(args.interval, 10);
  return params;
}

function resolveCommand(cmdTemplate, params) {
  const cmd = { ...cmdTemplate };
  for (const [key, value] of Object.entries(cmd)) {
    if (typeof value === 'string' && value.startsWith('$')) {
      const paramName = value.slice(1);
      if (paramName in params) cmd[key] = params[paramName];
    }
  }
  // Remove meta keys
  delete cmd.delay;
  delete cmd.repeat;
  delete cmd.interval;
  return cmd;
}

// ── Tier 0: Execute action commands ─────────────────────────────
async function executeTier0(skill) {
  const params = resolveParams(skill);
  log('tier0', `Executing ${skill.name} with params: ${JSON.stringify(params)}`);

  for (const cmdTemplate of skill.commands) {
    if (cmdTemplate.delay) await sleep(cmdTemplate.delay);

    const cmd = resolveCommand(cmdTemplate, params);
    const repeat = cmdTemplate.repeat
      ? (typeof cmdTemplate.repeat === 'string' && cmdTemplate.repeat.startsWith('$')
        ? params[cmdTemplate.repeat.slice(1)] || 1
        : cmdTemplate.repeat)
      : 1;
    const interval = cmdTemplate.interval
      ? (typeof cmdTemplate.interval === 'string' && cmdTemplate.interval.startsWith('$')
        ? params[cmdTemplate.interval.slice(1)] || 100
        : cmdTemplate.interval)
      : 100;

    for (let i = 0; i < repeat; i++) {
      await sendCommand(cmd);
      if (i < repeat - 1) await sleep(interval);
    }
  }

  log('tier0', `${skill.name} complete`);
}

// ── Tier 1: Reactive behavior logic ─────────────────────────────
const REACTIVE_LOGIC = {
  'avoid-nearest-threat': async (skill, durationMs) => {
    const params = resolveParams(skill);
    const { safeMargin, roadTop, roadBottom, reactionDistance } = params;
    const start = Date.now();
    let ticks = 0;

    log('tier1', `Running avoid-nearest-threat for ${durationMs}ms`);

    while (Date.now() - start < durationMs) {
      const state = await getState();
      if (!state || !state.alive) {
        log('tier1', `Player not alive or no state — stopping`);
        break;
      }

      const threat = state.threat;
      if (threat && Math.abs(threat.dx) < reactionDistance) {
        // Threat nearby — dodge
        const playerY = state.player?.y ?? state.playerY;
        let targetY;

        if (threat.dy > 0) {
          // Threat is below — move up
          targetY = Math.max(roadTop, playerY - safeMargin);
        } else if (threat.dy < 0) {
          // Threat is above — move down
          targetY = Math.min(roadBottom, playerY + safeMargin);
        } else {
          // Same lane — pick direction with more room
          const roomUp = playerY - roadTop;
          const roomDown = roadBottom - playerY;
          targetY = roomDown > roomUp
            ? Math.min(roadBottom, playerY + safeMargin)
            : Math.max(roadTop, playerY - safeMargin);
        }

        await sendCommand({ type: 'move-y', y: Math.round(targetY) });
        ticks++;
      }

      await sleep(200); // React every 200ms
    }

    log('tier1', `avoid-nearest-threat done — ${ticks} dodge commands sent`);
    return { ticks };
  },

  'stay-center': async (skill, durationMs) => {
    const params = resolveParams(skill);
    const { targetY, deadzone } = params;
    const start = Date.now();
    let corrections = 0;

    log('tier1', `Running stay-center (targetY=${targetY}) for ${durationMs}ms`);

    while (Date.now() - start < durationMs) {
      const state = await getState();
      if (!state || !state.alive) break;

      const playerY = state.player?.y ?? state.playerY;
      if (Math.abs(playerY - targetY) > deadzone) {
        await sendCommand({ type: 'move-y', y: targetY });
        corrections++;
      }

      await sleep(300);
    }

    log('tier1', `stay-center done — ${corrections} corrections`);
    return { corrections };
  },
};

async function executeTier1(skill, durationMs) {
  const handler = REACTIVE_LOGIC[skill.logic];
  if (!handler) {
    warn('tier1', `Unknown logic: ${skill.logic}`);
    return;
  }
  return handler(skill, durationMs);
}

// ── Tier 2: Compound skill execution ────────────────────────────
async function executeTier2(skill) {
  const params = resolveParams(skill);
  const durationMs = parseInt(args.duration, 10) || params.durationMs || 30000;
  const speedInterval = params.speedBurstInterval || 5000;

  log('tier2', `Running compound skill: ${skill.name} for ${durationMs}ms`);

  // Execute sub-skills
  const subSkillDefs = skill.subSkills.map(name => skills.find(s => s.name === name));

  // First: execute any tier-0 setup skills (like skip-to-play)
  for (const sub of subSkillDefs) {
    if (!sub) continue;
    if (sub.tier === 0) {
      await executeTier0(sub);
      await sleep(1000); // wait for state transition
    }
  }

  // Then: run reactive skills in parallel with periodic atomic actions
  const reactiveSkills = subSkillDefs.filter(s => s && s.tier === 1);
  const atomicSkills = subSkillDefs.filter(s => s && s.tier === 0 && s.name !== 'skip-to-play' && s.name !== 'return-to-title');

  // Run all reactive skills concurrently
  const reactivePromises = reactiveSkills.map(s => executeTier1(s, durationMs));

  // Periodically fire atomic skills
  if (atomicSkills.length > 0) {
    const atomicLoop = (async () => {
      const start = Date.now();
      while (Date.now() - start < durationMs) {
        await sleep(speedInterval);
        for (const a of atomicSkills) {
          const state = await getState();
          if (!state || !state.alive) return;
          await executeTier0(a);
        }
      }
    })();
    reactivePromises.push(atomicLoop);
  }

  await Promise.all(reactivePromises);

  // Read final state
  const finalState = await getState();
  log('tier2', `${skill.name} complete — final state: ${finalState?.stateName || 'unknown'}`);
  return { finalState };
}

// ── Main ────────────────────────────────────────────────────────
async function main() {
  const skillDef = skills.find(s => s.name === args.skill);
  if (!skillDef) {
    console.error(`Unknown skill: "${args.skill}"`);
    console.error(`Available: ${skills.map(s => s.name).join(', ')}`);
    process.exit(1);
  }

  log('run', `Skill: ${skillDef.name} (tier ${skillDef.tier}, ${skillDef.type})`);

  // Check prerequisites
  if (skillDef.requires?.states?.length) {
    const state = await getState();
    if (state && !skillDef.requires.states.includes(state.stateName)) {
      warn('run', `Current state ${state.stateName} not in required ${skillDef.requires.states.join('/')}`);
    }
  }

  const startState = await getState();
  log('run', `Start state: ${startState?.stateName || 'unknown'}, frame: ${startState?.frameCount || 0}`);

  switch (skillDef.tier) {
    case 0:
      await executeTier0(skillDef);
      break;
    case 1:
      await executeTier1(skillDef, DURATION);
      break;
    case 2:
      await executeTier2(skillDef);
      break;
  }

  const endState = await getState();
  log('run', `End state: ${endState?.stateName || 'unknown'}, frame: ${endState?.frameCount || 0}`);

  if (endState) {
    console.log('\n--- Final State ---');
    console.log(JSON.stringify({
      stateName: endState.stateName,
      alive: endState.alive,
      score: endState.score,
      elapsed: endState.elapsed,
      player: endState.player,
      metrics: endState.metrics,
      threat: endState.threat,
    }, null, 2));
  }
}

main().catch((e) => {
  console.error(`Fatal: ${e.message}`);
  process.exit(1);
});
