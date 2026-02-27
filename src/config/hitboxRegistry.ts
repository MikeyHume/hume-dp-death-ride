/**
 * hitboxRegistry.ts — Static metadata for every interactive element in the game.
 *
 * Used by HitboxVisualizer to show info cards when the user taps a highlighted hitbox.
 * Each entry is keyed by the game object's `.name` (Phaser) or `data-hitbox` attribute (HTML).
 */

export interface HitboxMeta {
  name: string;            // Human-readable display name
  description: string;     // What this element does
  tuningVars: string[];    // Tuning constants that control position/scale
  codeRef: string;         // "File.ts:lineNumber"
  callbackSummary: string; // Brief description of the callback code
  system: string;          // Which system owns this element
}

/** Color per system (used by HitboxVisualizer for drawing). */
export const SYSTEM_COLORS: Record<string, string> = {
  GameScene:       '#00ff44',
  InputSystem:     '#ffff00',
  MusicPlayer:     '#00ccff',
  ProfilePopup:    '#cc44ff',
  SettingsPopup:   '#ff8800',
  DisconnectModal: '#ff4444',
  ProfileHud:      '#ffffff',
  WMPPopup:        '#4488ff',
};

const REGISTRY = new Map<string, HitboxMeta>();

function reg(id: string, meta: HitboxMeta) { REGISTRY.set(id, meta); }

// ═══════════════════════════════════════════════════
// GameScene interactive elements
// ═══════════════════════════════════════════════════

reg('rocket-button', {
  name: 'Rocket Button',
  description: 'Fires a rocket projectile (mobile action button, top-right)',
  tuningVars: ['ACTION_BTN_TOP_X', 'ACTION_BTN_TOP_Y', 'ACTION_BTN_TOP_SCALE'],
  codeRef: 'GameScene.ts:630-633',
  callbackSummary: "play('btn-rocket-press') → rocketFired = true",
  system: 'GameScene',
});

reg('slash-button', {
  name: 'Slash Button',
  description: 'Triggers katana slash attack (mobile action button, bottom-right)',
  tuningVars: ['ACTION_BTN_BOT_X', 'ACTION_BTN_BOT_Y', 'ACTION_BTN_BOT_SCALE'],
  codeRef: 'GameScene.ts:646-649',
  callbackSummary: "play('btn-slash-press') → attackFired = true",
  system: 'GameScene',
});

reg('name-input', {
  name: 'Name Input Text',
  description: 'Clickable text that focuses the hidden name input field for high score entry',
  tuningVars: [],
  codeRef: 'GameScene.ts:973-974',
  callbackSummary: 'nameHiddenInput.focus()',
  system: 'GameScene',
});

reg('name-enter-btn', {
  name: 'Name Enter Button',
  description: 'Submits the high score name entry',
  tuningVars: [],
  codeRef: 'GameScene.ts:1000-1008',
  callbackSummary: 'Submit name → save score → show leaderboard',
  system: 'GameScene',
});

reg('empty-yes', {
  name: 'Empty Name YES Button',
  description: 'Confirms submitting with empty/default name',
  tuningVars: [],
  codeRef: 'GameScene.ts:1036-1045',
  callbackSummary: 'Allow empty name → proceed to leaderboard',
  system: 'GameScene',
});

reg('empty-no', {
  name: 'Empty Name NO Button',
  description: 'Cancels empty name and re-focuses name input',
  tuningVars: [],
  codeRef: 'GameScene.ts:1049-1058',
  callbackSummary: 'Cancel → re-focus nameHiddenInput',
  system: 'GameScene',
});

reg('tutorial-skip', {
  name: 'Tutorial Skip Button',
  description: 'Skips the tutorial and starts the countdown sequence',
  tuningVars: ['SKIP_BTN_SCALE', 'SKIP_BTN_MARGIN_RIGHT', 'SKIP_BTN_MARGIN_BOTTOM', 'SKIP_BTN_PULSE_MAX', 'SKIP_BTN_PULSE_SPEED'],
  codeRef: 'GameScene.ts:1127-1171',
  callbackSummary: 'Skip tutorial → resume audio context → startCountdown()',
  system: 'GameScene',
});

reg('screen-tap', {
  name: 'Full Screen Tap Zone',
  description: 'Advances game state (BIOS → Title → Tutorial → Countdown → Gameplay)',
  tuningVars: ['MOBILE_TAP_THRESHOLD'],
  codeRef: 'GameScene.ts:469-484, handleScreenTap():2843',
  callbackSummary: 'Skip BIOS / advance title / skip tutorial / skip countdown',
  system: 'GameScene',
});

// ═══════════════════════════════════════════════════
// ProfileHud
// ═══════════════════════════════════════════════════

reg('hud-profile', {
  name: 'Profile HUD Hit Zone',
  description: 'Opens the profile popup when clicked (covers avatar + score + bar)',
  tuningVars: ['HUD_SCALE', 'HUD_ORIGIN_X', 'HUD_ORIGIN_Y', 'AVATAR_RADIUS'],
  codeRef: 'ProfileHud.ts:119-134',
  callbackSummary: 'pointerover → white overlay + hover SFX; pointerdown → open ProfilePopup',
  system: 'ProfileHud',
});

// ═══════════════════════════════════════════════════
// ProfilePopup
// ═══════════════════════════════════════════════════

reg('profile-avatar', {
  name: 'Profile Avatar Click',
  description: 'Opens file picker to upload a new avatar image',
  tuningVars: ['AVATAR_RADIUS', 'AVATAR_X'],
  codeRef: 'ProfilePopup.ts:264-271',
  callbackSummary: 'openFilePicker() → onFileSelected() → upload to Supabase',
  system: 'ProfilePopup',
});

reg('profile-name-edit', {
  name: 'Name Edit Box',
  description: 'Starts inline name editing on click',
  tuningVars: ['RIGHT_BOX_W', 'NAME_BOX_H'],
  codeRef: 'ProfilePopup.ts:305-309',
  callbackSummary: 'startNameEditing() + click SFX',
  system: 'ProfilePopup',
});

reg('profile-spotify-btn', {
  name: 'Spotify Connect Button',
  description: 'Starts Spotify login flow or shows disconnect confirmation if connected',
  tuningVars: ['SPOTIFY_BTN_W_EFF', 'SPOTIFY_BTN_H_EFF'],
  codeRef: 'ProfilePopup.ts:331-365',
  callbackSummary: 'isConnected → disconnect modal; else → startLogin()',
  system: 'ProfilePopup',
});

reg('profile-exit', {
  name: 'Profile Popup Exit',
  description: 'Closes the profile popup',
  tuningVars: ['EXIT_BTN_W', 'EXIT_BTN_H', 'EXIT_Y'],
  codeRef: 'ProfilePopup.ts:454-457',
  callbackSummary: 'close() + click SFX',
  system: 'ProfilePopup',
});

reg('profile-scrollbar', {
  name: 'Profile Scrollbar Thumb',
  description: 'Draggable scrollbar for stats list',
  tuningVars: ['SCROLLBAR_W'],
  codeRef: 'ProfilePopup.ts:413-428',
  callbackSummary: 'scrollbarDragging = true → applyScrollFromPointer()',
  system: 'ProfilePopup',
});

// ═══════════════════════════════════════════════════
// SettingsPopup
// ═══════════════════════════════════════════════════

reg('settings-backdrop', {
  name: 'Settings Backdrop',
  description: 'Closes settings popup when clicking outside the panel',
  tuningVars: ['BACKDROP_ALPHA'],
  codeRef: 'SettingsPopup.ts:69-70',
  callbackSummary: 'close()',
  system: 'SettingsPopup',
});

reg('settings-debug-toggle', {
  name: 'Debug Toggle',
  description: 'Toggles debug mode ON/OFF (enables debug overlay and hotkeys)',
  tuningVars: ['TOGGLE_ROW_W', 'TOGGLE_ROW_H', 'TOGGLE_Y'],
  codeRef: 'SettingsPopup.ts:121-131',
  callbackSummary: 'debugEnabled = !debugEnabled → onDebugToggle(enabled)',
  system: 'SettingsPopup',
});

reg('settings-exit', {
  name: 'Settings Exit Button',
  description: 'Closes the settings popup',
  tuningVars: ['EXIT_BTN_W', 'EXIT_BTN_H', 'EXIT_Y'],
  codeRef: 'SettingsPopup.ts:168-173',
  callbackSummary: 'close() + click SFX',
  system: 'SettingsPopup',
});

// ═══════════════════════════════════════════════════
// DisconnectModal
// ═══════════════════════════════════════════════════

reg('disconnect-backdrop', {
  name: 'Disconnect Modal Backdrop',
  description: 'Dismisses the disconnect modal when tapping outside the dialog',
  tuningVars: ['DIALOG_W', 'DIALOG_H'],
  codeRef: 'DisconnectModal.ts:26-38',
  callbackSummary: 'Dismiss if tap is outside dialog bounds',
  system: 'DisconnectModal',
});

reg('disconnect-yes', {
  name: 'Disconnect YES Button',
  description: 'Confirms Spotify disconnect — logs out and clears tokens',
  tuningVars: ['BTN_W', 'BTN_H', 'BTN_GAP'],
  codeRef: 'DisconnectModal.ts:79-83',
  callbackSummary: 'answer(true) → disconnect Spotify + click SFX',
  system: 'DisconnectModal',
});

reg('disconnect-no', {
  name: 'Disconnect NO Button',
  description: 'Cancels Spotify disconnect and closes the modal',
  tuningVars: ['BTN_W', 'BTN_H', 'BTN_GAP'],
  codeRef: 'DisconnectModal.ts:101-105',
  callbackSummary: 'answer(false) → close modal + click SFX',
  system: 'DisconnectModal',
});

// ═══════════════════════════════════════════════════
// MusicPlayer (HTML elements — keyed by data-hitbox attribute)
// ═══════════════════════════════════════════════════

reg('music-settings', {
  name: 'Music Settings/Menu Button',
  description: 'Opens the Settings popup (gear icon, far right of music controls)',
  tuningVars: ['MUSIC_BTN_SCALE'],
  codeRef: 'MusicPlayer.ts:545',
  callbackSummary: 'onSettingsClickCb() → settingsPopup.toggle()',
  system: 'MusicPlayer',
});

reg('music-prev', {
  name: 'Previous Track Button',
  description: 'Skips to the previous track in the playlist',
  tuningVars: ['MUSIC_BTN_SCALE'],
  codeRef: 'MusicPlayer.ts:548',
  callbackSummary: 'prev() → play previous track',
  system: 'MusicPlayer',
});

reg('music-next', {
  name: 'Next Track Button',
  description: 'Skips to the next track in the playlist',
  tuningVars: ['MUSIC_BTN_SCALE'],
  codeRef: 'MusicPlayer.ts:549',
  callbackSummary: 'next() → play next track',
  system: 'MusicPlayer',
});

reg('music-mute', {
  name: 'Mute/Unmute Button',
  description: 'Toggles music mute on/off',
  tuningVars: ['MUSIC_BTN_SCALE'],
  codeRef: 'MusicPlayer.ts:550-551',
  callbackSummary: 'toggleMute()',
  system: 'MusicPlayer',
});

reg('music-heart', {
  name: 'Favorite Heart Button',
  description: 'Toggles favorite status for the current track (Supabase)',
  tuningVars: [],
  codeRef: 'MusicPlayer.ts:554-568',
  callbackSummary: 'toggleFavoriteById(trackId)',
  system: 'MusicPlayer',
});

reg('music-thumbnail', {
  name: 'Album Thumbnail',
  description: 'Opens Spotify link (desktop) or expands/collapses music player (mobile)',
  tuningVars: ['MUSIC_THUMB_SIZE'],
  codeRef: 'MusicPlayer.ts:480-492',
  callbackSummary: 'Desktop: open Spotify URL; Mobile: mobileExpand()/mobileCollapse()',
  system: 'MusicPlayer',
});

reg('music-title', {
  name: 'Track Title Link',
  description: 'Opens Spotify link for the current track',
  tuningVars: [],
  codeRef: 'MusicPlayer.ts:529-537',
  callbackSummary: 'Open Spotify track URL',
  system: 'MusicPlayer',
});

// ═══════════════════════════════════════════════════
// Lookup
// ═══════════════════════════════════════════════════

export function getHitboxMeta(id: string): HitboxMeta | undefined {
  return REGISTRY.get(id);
}

export function getAllHitboxIds(): string[] {
  return Array.from(REGISTRY.keys());
}
