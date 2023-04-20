const { ipcRenderer } = require('electron');

async function getMods() {
    const mods = await ipcRenderer.invoke('get-mods');
    const modsList = document.querySelector('.modslist');

    const table = document.createElement('table');
    table.innerHTML = `
    <thead>
      <tr>
        <th>Name</th>
        <th>Enabled</th>
        <th>Description</th>
        <th>Author</th>
        <th>Version</th>
        <th>Date</th>
      </tr>
    </thead>
    <tbody>
    </tbody>
  `;
    const tbody = table.querySelector('tbody');

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

    modsList.appendChild(table);
}

// Call the getMods function when the page has loaded
window.addEventListener('DOMContentLoaded', () => {
    getMods();
});
