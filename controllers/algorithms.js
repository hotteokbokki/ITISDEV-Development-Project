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
        case "SD":
            console.log("Executing Seasonal Decomposition function...")
            calculateSD();
            break;
        case "Holt":
            console.log("Executing Holt's Linear Trend function...");
            let alpha = 0.8; // Smoothing parameter for the level
            let beta = 0.2; // Smoothing parameter for the trend
            calculateHoltsLinearTrendForAllMaterials(alpha, beta, days);
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

// Function to Seasonal Decomposition for all raw materials
async function calculateSD(n) {
    try {
        const days = n;

        const response = await fetch(`/compute_SD?days=${days}`);
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
        console.error('Error computing Seasonal Decomposition:', error);
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

// Function to calculate Holt's Linear Trend for all raw materials
async function calculateHoltsLinearTrendForAllMaterials(alpha, beta, days) {
    try {
        const response = await fetch(`/compute_holts?alpha=${alpha}&beta=${beta}&days=${days}`);
        const data = await response.json();

        const tableBody = document.getElementById('analyticsTableBody');
        tableBody.innerHTML = ''; // Clear existing rows

        let holt = [];
        let level = data[0].value;
        let trend = data[1].value - data[0].value;

        for (let i = 0; i < data.length; i++) {
            if (i === 0) {
                holt.push(level);
            } else {
                let value = data[i].value;
                let newLevel = alpha * value + (1 - alpha) * (level + trend);
                let newTrend = beta * (newLevel - level) + (1 - beta) * trend;
                holt.push(newLevel + newTrend);
                level = newLevel;
                trend = newTrend;
            }
        }

        holt.forEach((row, index) => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>${data[index].name}</td>
                <td>${row}</td>
                <td>${data[index].unitMeasure}</td>
            `;
            tableBody.appendChild(tr);
        });

        console.log('Holt\'s Linear Trend:', holt);
    } catch (error) {
        console.error('Error calculating Holt\'s Linear Trend:', error);
    }
}