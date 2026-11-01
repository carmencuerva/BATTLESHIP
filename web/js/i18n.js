// UI strings in English and Spanish. t("key", {var}) fills {var} placeholders.

const STRINGS = {
  en: {
    loading_python: "Loading Python…",
    loading_packages: "Loading packages…",
    loading_arena: "Loading the arena…",
    load_failed: "Could not start the arena:",
    nav_play: "Play",
    nav_about: "About",
    menu_title: "New game",
    mode: "Mode",
    mode_hvb: "Human vs bot",
    mode_bvb: "Bot vs bot",
    mode_hvh: "Human vs human (same device)",
    opponent: "Opponent",
    bot_a: "Bot A",
    bot_b: "Bot B",
    name_a: "Player 1",
    name_b: "Player 2",
    board_size: "Board size",
    fleet: "Fleet (ship lengths)",
    speed: "Bot speed",
    speed_slow: "Slow",
    speed_normal: "Normal",
    speed_fast: "Fast",
    start: "Start",
    rules_short:
      "Ships may not touch, not even diagonally. A hit or a sink lets you shoot again. " +
      "Sinking a ship announces its length.",
    place_title: "{name}: place your fleet",
    place_help: "Pick a ship, then click the board. R or right-click rotates. Click a placed ship to move it.",
    rotate: "Rotate",
    random: "Random",
    clear: "Clear",
    ready: "Ready",
    horizontal: "horizontal",
    vertical: "vertical",
    pass_title: "Pass the device to {name}",
    pass_help: "{other}, look away!",
    pass_ready: "I'm {name}, show my boards",
    your_fleet: "Your fleet",
    enemy_waters: "Enemy waters",
    fleet_of: "Fleet of {name}",
    turn_you: "Your turn: fire at enemy waters.",
    turn_of: "{name} is shooting…",
    first_shooter: "{name} shoots first.",
    shot_miss: "{name} → {cell}: water.",
    shot_hit: "{name} → {cell}: hit! Shoots again.",
    shot_sunk: "{name} → {cell}: sunk a ship of length {length}! Shoots again.",
    afloat: "Afloat",
    shots: "Shots",
    hints: "Mark certain water",
    winner: "{name} wins!",
    forfeit: "{name} forfeits: {reason}",
    draw: "Draw: {reason}",
    play_again: "Play again",
    back_menu: "Menu",
    abandon: "Abandon",
    bad_fleet: "Invalid board/fleet: {reason}",
    you: "You",
    about_title: "About Battleship Arena",
    about_body:
      "The rules and every bot are written once, in Python. That same code runs the " +
      "tournament in CI and runs here in your browser thanks to Pyodide. Bots only ever " +
      "see what an attacker may know: the shots so far and which ship lengths are still afloat.",
  },
  es: {
    loading_python: "Cargando Python…",
    loading_packages: "Cargando paquetes…",
    loading_arena: "Cargando la arena…",
    load_failed: "No se pudo arrancar la arena:",
    nav_play: "Jugar",
    nav_about: "Acerca de",
    menu_title: "Nueva partida",
    mode: "Modo",
    mode_hvb: "Humano contra bot",
    mode_bvb: "Bot contra bot",
    mode_hvh: "Humano contra humano (mismo dispositivo)",
    opponent: "Rival",
    bot_a: "Bot A",
    bot_b: "Bot B",
    name_a: "Jugador 1",
    name_b: "Jugador 2",
    board_size: "Tamaño del tablero",
    fleet: "Flota (longitudes)",
    speed: "Velocidad de los bots",
    speed_slow: "Lenta",
    speed_normal: "Normal",
    speed_fast: "Rápida",
    start: "Empezar",
    rules_short:
      "Los barcos no pueden tocarse, ni en diagonal. Si tocas o hundes, repites turno. " +
      "Al hundir un barco se anuncia su longitud.",
    place_title: "{name}: coloca tu flota",
    place_help: "Elige un barco y haz clic en el tablero. R o clic derecho lo gira. Haz clic en un barco colocado para moverlo.",
    rotate: "Girar",
    random: "Aleatoria",
    clear: "Borrar",
    ready: "Listo",
    horizontal: "horizontal",
    vertical: "vertical",
    pass_title: "Pasa el dispositivo a {name}",
    pass_help: "{other}, ¡no mires!",
    pass_ready: "Soy {name}, enséñame mis tableros",
    your_fleet: "Tu flota",
    enemy_waters: "Aguas enemigas",
    fleet_of: "Flota de {name}",
    turn_you: "Tu turno: dispara a las aguas enemigas.",
    turn_of: "{name} está disparando…",
    first_shooter: "{name} dispara primero.",
    shot_miss: "{name} → {cell}: agua.",
    shot_hit: "{name} → {cell}: ¡tocado! Repite turno.",
    shot_sunk: "{name} → {cell}: ¡hundido un barco de {length}! Repite turno.",
    afloat: "A flote",
    shots: "Disparos",
    hints: "Marcar agua segura",
    winner: "¡Gana {name}!",
    forfeit: "{name} pierde por abandono: {reason}",
    draw: "Empate: {reason}",
    play_again: "Otra partida",
    back_menu: "Menú",
    abandon: "Abandonar",
    bad_fleet: "Tablero/flota no válidos: {reason}",
    you: "Tú",
    about_title: "Acerca de Battleship Arena",
    about_body:
      "Las reglas y todos los bots se escriben una sola vez, en Python. Ese mismo código " +
      "juega el torneo en la CI y se ejecuta aquí, en tu navegador, gracias a Pyodide. Los " +
      "bots solo ven lo que un atacante puede saber: los disparos hechos y qué longitudes " +
      "siguen a flote.",
  },
};

function initialLang() {
  try {
    const saved = localStorage.getItem("lang");
    if (saved in STRINGS) return saved;
  } catch {
    // storage unavailable: fall through to the browser language
  }
  return (navigator.language || "en").toLowerCase().startsWith("es") ? "es" : "en";
}

let lang = initialLang();

export function getLang() {
  return lang;
}

export function setLang(value) {
  lang = value in STRINGS ? value : "en";
  document.documentElement.lang = lang;
  try {
    localStorage.setItem("lang", lang);
  } catch {
    // not persisted; fine
  }
}

export function t(key, vars = {}) {
  const text = STRINGS[lang][key] ?? STRINGS.en[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, name) => (name in vars ? String(vars[name]) : `{${name}}`));
}
