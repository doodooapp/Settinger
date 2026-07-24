/* renderer/games-data.js
 * The games catalog shown in the left sidebar. Rust is first and fully wired
 * up to the config writer. Others are listed with curated preset guidance;
 * one-click auto-apply for them is on the roadmap (clearly flagged in the UI).
 * No third-party logos are used — each game gets a generated monogram badge.
 */
window.GAMES = [
  { id: 'rust',            name: 'Rust',                        genre: 'Survival',     accent: '#CD412B', supported: true,
    note: 'Facepunch survival. Fully supported — presets write straight to client.cfg.' },

  { id: 'cs2',             name: 'Counter-Strike 2',            genre: 'Tactical FPS', accent: '#E8A33D', supported: false },
  { id: 'valorant',       name: 'Valorant',                    genre: 'Tactical FPS', accent: '#FA4454', supported: false },
  { id: 'apex',           name: 'Apex Legends',                genre: 'Battle Royale',accent: '#DA292A', supported: false },
  { id: 'fortnite',       name: 'Fortnite',                    genre: 'Battle Royale',accent: '#7C4DFF', supported: false },
  { id: 'warzone',        name: 'Call of Duty: Warzone',       genre: 'Battle Royale',accent: '#5B6770', supported: false },
  { id: 'pubg',           name: 'PUBG: Battlegrounds',         genre: 'Battle Royale',accent: '#F2A900', supported: false },
  { id: 'tarkov',         name: 'Escape from Tarkov',          genre: 'Extraction',   accent: '#9A8866', supported: false },
  { id: 'hunt',           name: 'Hunt: Showdown 1896',         genre: 'Extraction',   accent: '#B5552D', supported: false },
  { id: 'r6',             name: 'Rainbow Six Siege',           genre: 'Tactical FPS', accent: '#3A8DDE', supported: false },
  { id: 'overwatch2',     name: 'Overwatch 2',                 genre: 'Hero FPS',     accent: '#F99E1A', supported: false },
  { id: 'dayz',           name: 'DayZ',                        genre: 'Survival',     accent: '#6E7B3A', supported: false },
  { id: 'ark',            name: 'ARK: Survival Ascended',      genre: 'Survival',     accent: '#2FA37C', supported: false },
  { id: 'minecraft',      name: 'Minecraft',                   genre: 'Sandbox',      accent: '#5DA130', supported: false },
  { id: 'gta5',           name: 'Grand Theft Auto V',          genre: 'Open World',   accent: '#6FB44A', supported: false },
  { id: 'rdr2',           name: 'Red Dead Redemption 2',       genre: 'Open World',   accent: '#B33A2B', supported: false },
  { id: 'cyberpunk',      name: 'Cyberpunk 2077',              genre: 'Open World',   accent: '#F3E600', supported: false },
  { id: 'eldenring',      name: 'Elden Ring',                  genre: 'Action RPG',   accent: '#C8A24B', supported: false },
  { id: 'bg3',            name: "Baldur's Gate 3",             genre: 'RPG',          accent: '#9B2D2D', supported: false },
  { id: 'witcher3',       name: 'The Witcher 3',               genre: 'RPG',          accent: '#C0392B', supported: false },
  { id: 'starfield',      name: 'Starfield',                   genre: 'RPG',          accent: '#4A78C2', supported: false },
  { id: 'bf2042',         name: 'Battlefield 2042',            genre: 'Shooter',      accent: '#3FA796', supported: false },
  { id: 'destiny2',       name: 'Destiny 2',                   genre: 'Looter FPS',   accent: '#6C7CB0', supported: false },
  { id: 'lol',            name: 'League of Legends',           genre: 'MOBA',         accent: '#C8943B', supported: false },
  { id: 'dota2',          name: 'Dota 2',                      genre: 'MOBA',         accent: '#A52A1E', supported: false },
  { id: 'marvelrivals',   name: 'Marvel Rivals',              genre: 'Hero FPS',     accent: '#D4A12B', supported: false },
  { id: 'deltaforce',     name: 'Delta Force',                 genre: 'Shooter',      accent: '#7E8C3F', supported: false },
  { id: 'thefinals',      name: 'The Finals',                  genre: 'Shooter',      accent: '#E0413E', supported: false },
];
