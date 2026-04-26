const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const PROJECTS_FILE = path.join(DATA_DIR, 'projects.json');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadJSON(file, defaultValue = {}) {
  try {
    if (fs.existsSync(file)) {
      return JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (e) {
    console.error(`Error loading ${file}:`, e.message);
  }
  return defaultValue;
}

function saveJSON(file, data) {
  try {
    fs.writeFileSync(file, JSON.stringify(data, null, 2));
  } catch (e) {
    console.error(`Error saving ${file}:`, e.message);
  }
}

module.exports = {
  users: {
    getAll: () => loadJSON(USERS_FILE, {}),
    get: (id) => loadJSON(USERS_FILE, {})[String(id)] || null,
    set: (id, data) => {
      const all = loadJSON(USERS_FILE, {});
      all[String(id)] = data;
      saveJSON(USERS_FILE, all);
    }
  },
  projects: {
    getAll: () => loadJSON(PROJECTS_FILE, {}),
    getByUser: (userId) => loadJSON(PROJECTS_FILE, {})[String(userId)] || [],
    set: (userId, projects) => {
      const all = loadJSON(PROJECTS_FILE, {});
      all[String(userId)] = projects;
      saveJSON(PROJECTS_FILE, all);
    },
    add: (userId, project) => {
      const all = loadJSON(PROJECTS_FILE, {});
      const uid = String(userId);
      if (!all[uid]) all[uid] = [];
      all[uid].push(project);
      saveJSON(PROJECTS_FILE, all);
    },
    getAllActive: () => {
      const all = loadJSON(PROJECTS_FILE, {});
      const active = [];
      for (const userId in all) {
        for (const proj of all[userId]) {
          if (proj.active) active.push({ ...proj, userId });
        }
      }
      return active;
    }
  },
  stats: {
    get: () => loadJSON(STATS_FILE, { totalReactions: 0, totalUsers: 0, totalProjects: 0 }),
    update: (updater) => {
      const data = loadJSON(STATS_FILE, { totalReactions: 0, totalUsers: 0, totalProjects: 0 });
      const updated = updater(data);
      saveJSON(STATS_FILE, updated);
      return updated;
    }
  }
};
