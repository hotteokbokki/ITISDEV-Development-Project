
function updateDateTime() {
    var currentDateElement = document.getElementById('currentDate');
    var currentDate = new Date();
    var options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', second: 'numeric', hour12: true };
    currentDateElement.textContent = currentDate.toLocaleDateString('en-US', options);
}


// DropDown Script for View Analytics

function toggleInputField() {
    var unit = document.getElementById("unit").value;
    var daysInput = document.getElementById("daysInput");
    if (unit === "SMA") {
        daysInput.style.display = "block";
    } else {
        daysInput.style.display = "none";
    }
}
