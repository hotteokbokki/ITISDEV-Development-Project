function compute() {
    var selectedAlgorithm = document.getElementById("unit").value;
    switch(selectedAlgorithm) {
        case "SMA":
            console.log("Executing Simple Moving Average function...");
            let nSMA = 1; // Number of days to consider for the moving average for SMA
            calculateSimpleMovingAverageForAllMaterials(nSMA);
            break;
        case "WMA":
            console.log("Executing Weighted Moving Average function...");
            let nWMA = 5; // Number of days to consider for the moving average for WMA
            calculateWeightedMovingAverageForAllMaterials(nWMA);
            break;
        case "KNN":
            console.log("Executing KNN Analytics function...");
            calculateKNN();
            break;
        default:
            console.log("Invalid algorithm selected");
    }
}

// Function to calculate Weighted Moving Average for all raw materials
async function calculateWeightedMovingAverageForAllMaterials(n) {
    try {
        const days = n;

        const response = await fetch(`/compute_wma?days=${days}`);
        const data = await response.json();

        const tableBody = document.getElementById('analyticsTableBody');
        tableBody.innerHTML = ''; // Clear existing rows

        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.name}</td>
                <td>${row.prediction}</td>
                <td>${row.unitMeasure}</td>
            `;
            tableBody.appendChild(tr);
        });

        console.log('Weighted Moving Averages:', data);
    } catch (error) {
        console.error('Error computing Weighted Moving Averages:', error);
    }
}

// Function to calculate Simple Moving Average for all raw materials
async function calculateSimpleMovingAverageForAllMaterials(n) {
    try {
        const days = n;

        const response = await fetch(`/compute_sma?days=${days}`);
        const data = await response.json();

        const tableBody = document.getElementById('analyticsTableBody');
        tableBody.innerHTML = ''; // Clear existing rows

        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.name}</td>
                <td>${row.prediction}</td>
                <td>${row.unitMeasure}</td>
            `;
            tableBody.appendChild(tr);
        });

        console.log('Simple Moving Averages:', data);
    } catch (error) {
        console.error('Error computing Simple Moving Averages:', error);
    }
}

async function calculateKNN() {
    try {
        const days = document.getElementById('days').value;

        const response = await fetch(`/compute_KNN?days=${days}`);
        const data = await response.json();
        const tableBody = document.getElementById('analyticsTableBody');
        tableBody.innerHTML = ''; // Clear existing rows
        data.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${row.name}</td>
                <td>${row.prediction}</td>
                <td>${row.unitMeasure}</td> 
            `;
            tableBody.appendChild(tr);
        });
    } catch (error) {
        console.error('Error computing KNN:', error);
    }
}
