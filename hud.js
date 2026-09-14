const toggle = document.getElementById('vehicleToggle')
  , choices = document.getElementById('vehicleChoices')
  , panel = document.querySelector('.vehicle-panel');
function setVehicles(open) {
    choices.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    panel.classList.toggle('expanded', open)
}
toggle.addEventListener('click', () => {
    const open = choices.hidden;
    setVehicles(open);
    if (open && document.getElementById('mapExpand').getAttribute('aria-expanded') === 'true')
        document.getElementById('mapExpand').click()
}
);
document.addEventListener('vehicle-selected', () => setVehicles(false));
document.getElementById('world').addEventListener('pointerdown', () => setVehicles(false));
document.getElementById('mapExpand').addEventListener('click', () => setVehicles(false));
const map = document.getElementById('map');
map.addEventListener('click', () => document.getElementById('mapExpand').click());
map.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        document.getElementById('mapExpand').click()
    }
}
);
document.addEventListener('keydown', e => {
    if (e.key === 'Escape')
        setVehicles(false)
}
);
