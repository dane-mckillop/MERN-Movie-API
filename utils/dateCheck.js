/**
 * Check if a date is valid before entering into database.
 * Date of birth must be a string matching format YYYY-MM-DD.
 * Year, Months and Days must not exceed real values, e.g. no 50 day months.
 * For leap years ensure correct number of days.
 * 
 * @param {string} dob - Date of birth to check.
 * @returns {boolean} - true if dob is valid, else false.
 */
module.exports = function dateCheck(dob) {
    // Date is a valid string in format "YYYY-MM-DD"
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!((typeof dob === "string") && (dateRegex.test(dob)) && (dob.length === 10))) {
        return false;
    };

    // Date is valid
    const providedDate = new Date(dob).getTime();
    if (isNaN(providedDate)) {
        return false;
    };

    // Split string for further checks.
    var [year, month, day] = dob.split("-");

    // Leap year check. If leap year and february, check days.
    if (isLeapYear(year) && month == 2) {
        if (day > 29) {
            return false;
        }
        // Javascript rollover check. Number of days matches month.
    } else {
        switch (month) {
            case "01": // January
            case "03": // March
            case "05": // May
            case "07": // July
            case "08": // August
            case "10": // October
            case "12": // December
                if (day > 31) {
                    return false;
                }
                break;

            case "04": // April
            case "06": // June
            case "09": // September
            case "11": // November
                if (day > 30) {
                    return false;
                }
                break;

            case "02": // February
                if (day > 28) {
                    return false;
                }
                break;

            default:
                return false;
        }
    }
    // Date is valid
    return true;
}

/**
 * Check if a given year is a leap year.
 * 
 * @param {string} year - year to be checked.
 * @returns {boolean} - true if leap year, else false.
 */
function isLeapYear(year) {
    return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}