/**
 * Test Runner for Rubber Tracker Apps Script project.
 * Add your test cases to the runAllTests() function.
 * Run this function in the Apps Script editor to execute all tests and log results.
 */

/* global buildSheets, saveCurrentStateToHistory, generateAllReports, processEdit, onEditHandler, updateInventoryReports, updatePurchaseNeeds */

// eslint-disable-next-line no-unused-vars
function runAllTests() {
  var results = [];

  // Example test cases (replace/add your own)
  try {
    results.push(testExampleFunction());
  } catch (e) {
    results.push('testExampleFunction FAILED: ' + e);
  }

  // Real project function tests
  try {
    results.push(testBuildSheets());
  } catch (e) {
    results.push('testBuildSheets FAILED: ' + e);
  }
  try {
    results.push(testSaveCurrentStateToHistory());
  } catch (e) {
    results.push('testSaveCurrentStateToHistory FAILED: ' + e);
  }
  try {
    results.push(testGenerateAllReports());
  } catch (e) {
    results.push('testGenerateAllReports FAILED: ' + e);
  }
  try {
    results.push(testProcessEdit());
  } catch (e) {
    results.push('testProcessEdit FAILED: ' + e);
  }
  try {
    results.push(testOnEditHandler());
  } catch (e) {
    results.push('testOnEditHandler FAILED: ' + e);
  }
  try {
    results.push(testGetPhysicalLocation());
  } catch (e) {
    results.push('testGetPhysicalLocation FAILED: ' + e);
  }
  try {
    results.push(testIsStatusLocation());
  } catch (e) {
    results.push('testIsStatusLocation FAILED: ' + e);
  }
  try {
    results.push(testMacksWorkflow());
  } catch (e) {
    results.push('testMacksWorkflow FAILED: ' + e);
  }

  Logger.log('Test Results:');
  results.forEach(function(result) { Logger.log(result); });
  return results;
}

// Example test function (replace with real tests)
function testExampleFunction() {
  // Replace with actual function call and assertions
  var expected = 2;
  var actual = 1 + 1;
  if (actual !== expected) throw 'Expected ' + expected + ', got ' + actual;
  return 'testExampleFunction PASSED';
}

// Test for buildSheets
function testBuildSheets() {
  try {
    buildSheets();
    // Optionally, check if key sheets exist after running buildSheets
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var expectedSheets = ['Gloves', 'Sleeves', 'Gloves History', 'Sleeves History', 'Reclaims'];
    var missing = expectedSheets.filter(function(name) {
      return !ss.getSheetByName(name);
    });
    if (missing.length > 0) throw 'Missing sheets: ' + missing.join(', ');
    return 'testBuildSheets PASSED';
  } catch (e) {
    throw 'buildSheets error: ' + e;
  }
}

// Test for saveCurrentStateToHistory
function testSaveCurrentStateToHistory() {
  try {
    // Optionally, count rows before and after to check if history is appended
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var glovesHistory = ss.getSheetByName('Gloves History');
    var sleevesHistory = ss.getSheetByName('Sleeves History');
    var glovesRowsBefore = glovesHistory ? glovesHistory.getLastRow() : 0;
    var sleevesRowsBefore = sleevesHistory ? sleevesHistory.getLastRow() : 0;
    saveCurrentStateToHistory();
    var glovesRowsAfter = glovesHistory ? glovesHistory.getLastRow() : 0;
    var sleevesRowsAfter = sleevesHistory ? sleevesHistory.getLastRow() : 0;
    if (glovesRowsAfter <= glovesRowsBefore && sleevesRowsAfter <= sleevesRowsBefore) {
      throw 'No new history rows appended';
    }
    return 'testSaveCurrentStateToHistory PASSED';
  } catch (e) {
    throw 'saveCurrentStateToHistory error: ' + e;
  }
}

// Test for generateAllReports
function testGenerateAllReports() {
  try {
    generateAllReports();
    // Optionally, check if Reclaims sheet is updated
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var reclaimsSheet = ss.getSheetByName('Reclaims');
    if (!reclaimsSheet) throw 'Missing Reclaims sheet';
    return 'testGenerateAllReports PASSED';
  } catch (e) {
    throw 'generateAllReports error: ' + e;
  }
}

// Test for processEdit
function testProcessEdit() {
  try {
    // Simulate an edit event (mock object)
    var e = {range: {getSheet: function() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Gloves'); }, getRow: function() { return 2; }, getColumn: function() { return 1; }}, value: 'Test'};
    processEdit(e);
    return 'testProcessEdit PASSED';
  } catch (e) {
    throw 'processEdit error: ' + e;
  }
}

// Test for onEditHandler
function testOnEditHandler() {
  try {
    // Simulate an edit event (mock object)
    var e = {range: {getSheet: function() { return SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Gloves'); }, getRow: function() { return 2; }, getColumn: function() { return 1; }}, value: 'Test'};
    onEditHandler(e);
    return 'testOnEditHandler PASSED';
  } catch (e) {
    throw 'onEditHandler error: ' + e;
  }
}




// Test for getPhysicalLocation
function testGetPhysicalLocation() {
  var cases = [
    { input: 'Helena', expected: 'Helena' },
    { input: 'Helena (Vacation)', expected: 'Helena' },
    { input: 'Bozeman (Light Duty)', expected: 'Bozeman' },
    { input: 'Great Falls', expected: 'Great Falls' },
    { input: '', expected: '' },
    { input: null, expected: '' }
  ];

  for (var i = 0; i < cases.length; i++) {
    var actual = getPhysicalLocation(cases[i].input);
    if (actual !== cases[i].expected) {
      throw 'getPhysicalLocation("' + cases[i].input + '") expected "' + cases[i].expected + '", got "' + actual + '"';
    }
  }
  return 'testGetPhysicalLocation PASSED';
}

// Test for isStatusLocation
function testIsStatusLocation() {
  var cases = [
    { input: 'Helena', expected: false },
    { input: 'Helena (Vacation)', expected: true },
    { input: 'Vacation', expected: true },
    { input: 'light duty', expected: true },
    { input: 'Bozeman (Light Duty)', expected: true },
    { input: 'Great Falls', expected: false },
    { input: '', expected: false },
    { input: null, expected: false }
  ];

  for (var i = 0; i < cases.length; i++) {
    var actual = isStatusLocation(cases[i].input);
    if (actual !== cases[i].expected) {
      throw 'isStatusLocation("' + cases[i].input + '") expected ' + cases[i].expected + ', got ' + actual;
    }
  }
  return 'testIsStatusLocation PASSED';
}

function testGetCrewLeadBug() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employees');
  if (!sheet) return 'Employees sheet not found';
  var data = sheet.getDataRange().getValues();
  var headers = data[0];
  
  var nameCol = -1;
  var jobNumCol = -1;
  var classificationCol = -1;
  var lastDayCol = -1;
  var crewLeadCol = -1;
  
  for (var h = 0; h < headers.length; h++) {
    var header = String(headers[h]).toLowerCase().trim();
    if (header === 'name' || header === 'employee name') nameCol = h;
    if (header === 'job number') jobNumCol = h;
    if (header === 'crew lead') crewLeadCol = h;
    if (header === 'job classification') classificationCol = h;
    if (header === 'last day') lastDayCol = h;
  }
  
  Logger.log('Columns found: name=' + nameCol + ', jobNum=' + jobNumCol + ', class=' + classificationCol + ', lastDay=' + lastDayCol + ', crewLead=' + crewLeadCol);
  
  for (var i = 1; i < data.length; i++) {
    var row = data[i];
    var jobNum = String(row[jobNumCol]).trim();
    if (jobNum.indexOf('042-26') !== -1) {
      Logger.log('Row ' + (i+1) + ': Name=' + row[nameCol] + ', JobNum=' + jobNum + ', Class=' + (classificationCol !== -1 ? row[classificationCol] : 'N/A') + ', CrewLead=' + (crewLeadCol !== -1 ? row[crewLeadCol] : 'N/A') + ', LastDay=' + (lastDayCol !== -1 ? row[lastDayCol] : 'N/A'));
    }
  }
  
  var lead = getCrewLead('042-26');
  Logger.log('Result from getCrewLead("042-26"): ' + JSON.stringify(lead));
  return 'testGetCrewLeadBug PASSED: ' + JSON.stringify(lead);
}

function debugSearchLogs() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var jhaSheet = ss.getSheetByName('JHA Log');
  Logger.log('=== DEBUG JHA LOG SEARCH ===');
  if (jhaSheet) {
    var data = jhaSheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var job = String(data[i][2] || '').trim();
      var credited = String(data[i][8] || '').trim();
      if (job.indexOf('046-29') !== -1 || job.indexOf('049-26') !== -1 || credited.indexOf('046-29') !== -1 || credited.indexOf('049-26') !== -1) {
        Logger.log('JHA Row ' + (i+1) + ': Received=' + data[i][0] + ', Created=' + data[i][1] + ', Job=' + job + ', Foreman=' + data[i][3] + ', Subject=' + data[i][4] + ', EmailId=' + data[i][5] + ', Status=' + data[i][7] + ', CreditedTo=' + credited + ', Notes=' + data[i][9]);
      }
    }
  } else {
    Logger.log('JHA Log sheet not found');
  }

  var weeklySheet = ss.getSheetByName('Weekly Safety Log');
  Logger.log('=== DEBUG WEEKLY SAFETY LOG SEARCH ===');
  if (weeklySheet) {
    var data = weeklySheet.getDataRange().getValues();
    for (var i = 1; i < data.length; i++) {
      var job = String(data[i][2] || '').trim();
      var credited = String(data[i][7] || '').trim();
      if (job.indexOf('046-29') !== -1 || job.indexOf('049-26') !== -1 || credited.indexOf('046-29') !== -1 || credited.indexOf('049-26') !== -1) {
        Logger.log('Weekly Row ' + (i+1) + ': Received=' + data[i][0] + ', WeekOf=' + data[i][1] + ', Job=' + job + ', Foreman=' + data[i][3] + ', Subject=' + data[i][4] + ', EmailId=' + data[i][5] + ', Status=' + data[i][6] + ', CreditedTo=' + credited + ', Notes=' + data[i][8]);
      }
    }
  } else {
    Logger.log('Weekly Safety Log sheet not found');
  }
}

function debugGetMessages() {
  var ids = ['19edc0dbf916dfc8', '19ecc3176dd49359', '19eb700e6775da6d'];
  for (var i = 0; i < ids.length; i++) {
    try {
      var msg = GmailApp.getMessageById(ids[i]);
      if (msg) {
        Logger.log('ID: ' + ids[i] + ' -> Subject: ' + msg.getSubject() + ', Date: ' + msg.getDate() + ', ThreadId: ' + msg.getThread().getId());
      } else {
        Logger.log('ID: ' + ids[i] + ' -> Not found');
      }
    } catch (e) {
      Logger.log('ID: ' + ids[i] + ' -> Error: ' + e.toString());
    }
  }
}

function checkEmployeesForMatchingTest() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName('Employees');
  if (!sheet) {
    Logger.log('Employees sheet not found');
    return;
  }
  var data = sheet.getDataRange().getValues();
  Logger.log('Total employee rows: ' + data.length);
  var targetNames = ['darrell swann', 'dillon hahnkamp', 'tyson smith', 'daniel cole'];
  for (var i = 1; i < data.length; i++) {
    var name = String(data[i][0] || '').trim();
    var nameLower = name.toLowerCase();
    for (var j = 0; j < targetNames.length; j++) {
      if (nameLower.indexOf(targetNames[j]) !== -1) {
        Logger.log('Match found in row ' + (i+1) + ': Name="' + name + '", Location="' + data[i][1] + '", JobNum="' + data[i][2] + '"');
      }
    }
  }
}

// Test for MACKs workflow functions
function testMacksWorkflow() {
  try {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // Check if sheets exist
    var macksSheet = ss.getSheetByName(SHEET_MACKS);
    if (!macksSheet) throw 'MACKs sheet missing';
    var mackSwapsSheet = ss.getSheetByName(SHEET_MACK_SWAPS);
    if (!mackSwapsSheet) throw 'MACK Swaps sheet missing';
    
    // Check ensureMackHistorySheet
    var historySheet = ensureMackHistorySheet();
    if (!historySheet) throw 'ensureMackHistorySheet failed to return sheet';
    
    // Check date calculation
    var testDate = new Date(2026, 3, 15); // Apr 15, 2026
    var expected = new Date(testDate);
    expected.setMonth(expected.getMonth() + 12);
    var actual = calculateMackChangeOut(testDate, 'Test Employee', 'Helena');
    if (actual.getTime() !== expected.getTime()) {
      throw 'calculateMackChangeOut returned incorrect date. Expected ' + expected + ', got ' + actual;
    }
    
    return 'testMacksWorkflow PASSED';
  } catch (e) {
    throw 'testMacksWorkflow error: ' + e;
  }
}


