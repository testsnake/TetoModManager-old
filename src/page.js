const { ipcRenderer } = require('electron');

let mods;
let tbody;
let activeProfile;
let currentProfiles;

async function getMods() {
    mods = await ipcRenderer.invoke('get-mods');
    const modsList = document.querySelector('.modslist');

    const table = document.createElement('table');
    table.innerHTML = `
    <thead>
      <tr>
        <th data-sort-key="priority" id="header-priority">Priority</th>
        <th data-sort-key="name" id="header-name">Name</th>
        <th data-sort-key="enabled" id="header-enabled">Enabled</th>
        <th data-sort-key="description" id="header-description">Description</th>
        <th data-sort-key="author" id="header-author">Author</th>
        <th data-sort-key="version" id="header-version">Version</th>
        <th data-sort-key="date" id="header-date">Date</th>
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
        console.log('Sorting by', key, asc);
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

            // Check if the same header was clicked again
            if (header.getAttribute('data-sorted') === 'true') {
                // Toggle the `asc` variable if the same header was clicked
                asc = !asc;
            } else {
                // Reset the `asc` variable if a different header was clicked
                asc = true;
            }

            // Pass the `asc` variable to the `sortRows` function
            sortRows(sortKey, asc);

            // Mark all headers as unsorted
            headers.forEach(h => h.setAttribute('data-sorted', 'false'));

            // Mark the clicked header as sorted
            header.setAttribute('data-sorted', 'true');
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
        <td>${mod.priority !== null ? mod.priority : ''}</td>
        <td>${modName.replace(/^"(.*)"$/, '$1')}</td>
        <td><input type="checkbox" ${mod.enabled ? 'checked' : ''}></td>
        <td>${mod.description ? mod.description.replace(/^"(.*)"$/, '$1') : ''}</td>
        <td>${mod.author ? mod.author.replace(/^"(.*)"$/, '$1') : ''}</td>
        <td>${mod.version ? mod.version.replace(/^"(.*)"$/, '$1') : ''}</td>
        <td>${mod.date ? mod.date.replace(/^"(.*)"$/, '$1') : ''}</td>
        `;

        row.addEventListener('click', () => {
            const selectedRows = document.querySelectorAll('tr.selected');
            selectedRows.forEach((selectedRow) => {
                selectedRow.classList.remove('selected');
            });
            console.log(modName)
            row.classList.add('selected');
        });

        const checkbox = row.querySelector('input[type="checkbox"]');
        checkbox.addEventListener('click', () => {
            ipcRenderer.invoke('set-mod-status', modName, checkbox.checked);
        });

        tbody.appendChild(row);
    }
}

// Function to get profiles
async function getProfiles() {
    currentProfiles = await ipcRenderer.invoke('get-profiles');
    const profileSelector = document.getElementById('profile-selector');

    // Populate the dropdown with profile names
    for (const profileName in currentProfiles) {
        const option = document.createElement('option');
        option.value = profileName;
        option.innerText = profileName;
        profileSelector.appendChild(option);
    }

    // Set the active profile and update the mod list
    profileSelector.addEventListener('change', async () => {
        activeProfile = profileSelector.value;
        await ipcRenderer.invoke('set-active-profile', activeProfile);
        await reloadMods();
    });

    // Set the initial active profile
    activeProfile = await ipcRenderer.invoke('get-active-profile');
    profileSelector.value = activeProfile;
}

// Function to update mod priority
async function updateModPriority(increase) {
    console.log('Updating mod priority');
    const selectedMod = document.querySelector('tr.selected');
    if (selectedMod) {
        const modName = selectedMod.querySelector('td:first-child').innerText;
        await ipcRenderer.invoke(increase ? 'increase-mod-priority' : 'decrease-mod-priority', modName);
        await reloadMods();
    }
}

// Update the DOMContentLoaded event listener
window.addEventListener('DOMContentLoaded', async () => {
    await getProfiles();
    await getMods();

    // Add event listeners for the buttons
    const launchGameButton = document.getElementById('launch-game');
    const reloadModsButton = document.getElementById('reload-mods');
    const searchInput = document.getElementById('search-input');
    const openModFolderButton = document.getElementById('open-folder');
    const increaseModPriorityButton = document.getElementById('increase-mod-priority');
    const decreaseModPriorityButton = document.getElementById('decrease-mod-priority');

    launchGameButton.addEventListener('click', launchGame);
    reloadModsButton.addEventListener('click', reloadMods);
    openModFolderButton.addEventListener('click', openModFolder);
    searchInput.addEventListener('input', () => {
        searchMods(mods, searchInput.value);
    });
    increaseModPriorityButton.addEventListener('click', () => updateModPriority(true));
    decreaseModPriorityButton.addEventListener('click', () => updateModPriority(false));
});


// Call the getMods function when the page has loaded
// Function to launch the game
function launchGame() {
    ipcRenderer.send('launch-game');
}

function openModFolder() {
    ipcRenderer.send('open-mod-folder');
}

// Function to reload the mods
async function reloadMods() {
    mods = await ipcRenderer.invoke('get-mods');
    populateRows(mods);
}

