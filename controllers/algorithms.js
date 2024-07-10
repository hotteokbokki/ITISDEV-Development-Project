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
        default:
            console.log("Invalid algorithm selected");
    }
}

// Function to calculate Weighted Moving Average for all raw materials
async function calculateWeightedMovingAverageForAllMaterials(n) {
    try {
        // Get the number of days from the input field
        const days = n;

        // Fetch data from the server
        const response = await fetch(`/compute_wma?days=${days}`);
        const data = await response.json();

        // Log or process the data as required
        console.log('Weighted Moving Averages:', data);
    } catch (error) {
        console.error('Error computing Weighted Moving Averages:', error);
    }
}


                            /* SMA */
// Function to calculate Simple Moving Average for all raw materials
async function calculateSimpleMovingAverageForAllMaterials(n) {
    try {
        // Get the number of days from the input field
        const days = n;

        // Fetch data from the server
        const response = await fetch(`/compute_sma?days=${days}`);
        const data = await response.json();

        // Log or process the data as required
        console.log('Simple Moving Averages:', data);
    } catch (error) {
        console.error('Error computing Simple Moving Averages:', error);
    }
}

// Function to calculate Simple Moving Average
function calculateSimpleMovingAverage(dataPoints, n) {
    const numDataPoints = Math.min(n, dataPoints.length); // Ensure n does not exceed the number of data points

    // Calculate Simple Moving Average
    let sum = 0;
    for (let i = 0; i < numDataPoints; i++) {
        sum += dataPoints[i];
    }
    let sma = sum / numDataPoints;
    return sma;
}

// Example usage
let n = 5; // Number of days to consider for the moving average
calculateSimpleMovingAverageForAllMaterials(n);


 //Function for quantity:

//QUERIES
//1. to get col 1 and 3 in the to buy table (COL1: raw mat name, col 2: amount to be bought, col3: the unit of measure ex: ml or g)
//SELECT rm."name", rm."unit_Measure" FROM "raw_Materials" AS rm;
//2. to get the quantity for the main formula (amount to buy formula)
//SELECT rm."name", rm."quantity" FROM "raw_Materials" AS rm;

//Formulas/logic:
//the formula below should be a loop to be ran for all raw materials, every iteration of the loop is a seperate raw material
//Amount of raw material NEEDED TO BE BOUGHT = (current stock for the day AKA stock before the store opens - DEMAND) + THRESHOLD
//amount or value for demand will depend on what formula is chosen 
//ex: if SMA is chosen by user answer for SMA formula is what will replace demand (same goes if another formula is chosen)
//threshold formula: THRESHOLD = (number of expired items of the raw material + number of missing items of the raw material) DIVIDED by age of system (days) aka num of days system has been running

//Function for quantity:
/*
1. to get col 1 and 3 in the to buy table
SELECT rm."name", rm."unit_Measure" FROM "raw_Materials" AS rm;

2. to get the quantity for the main formula (amount to buy formula)
SELECT rm."name", rm."quantity" FROM "raw_Materials" AS rm;
*/

//Funtion for threshold but only fetches this part of the formula: THRESHOLD = (number of expired items of the raw material + number of missing items of the raw material)
// missing: DIVIDED by age of system (days) aka num of days system has been running
/*
SELECT rmo."materialID", rm."name", COUNT(rmo."reason")
FROM "rawMaterials_Out" rmo
LEFT JOIN "raw_Materials" rm
ON rmo."materialID" = rm."materialID"
WHERE (rmo."reason" = 'missing' or rmo."reason" = 'expired')
GROUP BY rmo."materialID", rm."name"
*/

// missing: DIVIDED by age of system (days) aka num of days system has been running
async function calculateThresholdForEachMaterial(rawMaterials, systemStartDate) {
    let currentDate = new Date();
    let startDate = new Date(systemStartDate);
    let differenceInTime = currentDate.getTime() - startDate.getTime();
    let differenceInDays = differenceInTime / (1000 * 3600 * 24);

    for (let material of rawMaterials) {
        let expiredCount = await getExpiredCount(material.id);
        let missingCount = await getMissingCount(material.id);

        let threshold = (expiredCount + missingCount) / differenceInDays;
        console.log(Threshold for ${material.name}: ${threshold});
    }
}
