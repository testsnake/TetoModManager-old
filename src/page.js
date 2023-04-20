const { ipcRenderer } = require('electron');

let mods;
let tbody;

async function getMods() {
    mods = await ipcRenderer.invoke('get-mods');
    const modsList = document.querySelector('.modslist');

    const table = document.createElement('table');
    table.innerHTML = `
    <thead>
      <tr>
        <th data-sort-key="name">Name</th>
        <th data-sort-key="enabled">Enabled</th>
        <th data-sort-key="description">Description</th>
        <th data-sort-key="author">Author</th>
        <th data-sort-key="version">Version</th>
        <th data-sort-key="date">Date</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  `;
    tbody = table.querySelector('tbody');

    // Populate table rows


    populateRows(mods);

    // Sort table rows
    function sortRows(key, asc = true) {
        const sortedMods = Object.entries(mods).sort((a, b) => {
            const aValue = a[1][key];
            const bValue = b[1][key];

            if (typeof aValue === 'string') {
                return asc ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
            } else if (typeof aValue === 'boolean') {
                return aValue === bValue ? 0 : (asc ? (aValue ? -1 : 1) : (aValue ? 1 : -1));
            } else {
                return asc ? (aValue - bValue) : (bValue - aValue);
            }
        });

        const sortedModsObj = {};
        for (const [modName, mod] of sortedMods) {
            sortedModsObj[modName] = mod;
        }

        populateRows(sortedModsObj);
    }


    // Add sorting event listeners
    const headers = table.querySelectorAll('th[data-sort-key]');
    headers.forEach(header => {
        header.style.cursor = 'pointer';
        let asc = true;

        header.addEventListener('click', () => {
            const sortKey = header.dataset.sortKey;
            sortRows(mods, sortKey, asc);
            asc = !asc;
        });
    });

    modsList.appendChild(table);
}

// Search function
function searchMods(mods, query) {
    const filteredMods = {};

    for (const modName in mods) {
        const mod = mods[modName];
        const searchString = `${modName} ${mod.description} ${mod.author} ${mod.version} ${mod.date}`.toLowerCase();

        if (searchString.includes(query.toLowerCase())) {
            filteredMods[modName] = mod;
        }
    }

    populateRows(filteredMods);
}

function populateRows(mods) {
    tbody.innerHTML = '';

    for (const modName in mods) {
        const mod = mods[modName];

        const row = document.createElement('tr');
        row.innerHTML = `
        <td>${modName}</td>
        <td><input type="checkbox" ${mod.enabled ? 'checked' : ''}></td>
        <td>${mod.description}</td>
        <td>${mod.author}</td>
        <td>${mod.version}</td>
        <td>${mod.date}</td>
      `;

        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('click', () => {
            ipcRenderer.invoke('set-mod-status', modName, checkbox.checked);
        });

        tbody.appendChild(row);
    }
}


// Call the getMods function when the page has loaded
// Function to launch the game
function launchGame() {
    ipcRenderer.send('launch-game');
}

// Function to reload the mods
async function reloadMods() {
    mods = await ipcRenderer.invoke('get-mods');
    populateRows(mods);
}

// Call the getMods function when the page has loaded
window.addEventListener('DOMContentLoaded', () => {
    getMods();

    // Add event listeners for the buttons
    const launchGameButton = document.getElementById('launch-game');
    const reloadModsButton = document.getElementById('reload-mods');
    const searchInput = document.getElementById('search-input');

    launchGameButton.addEventListener('click', launchGame);
    reloadModsButton.addEventListener('click', reloadMods);
    searchInput.addEventListener('input', () => {
        searchMods(mods, searchInput.value);
    });
});
