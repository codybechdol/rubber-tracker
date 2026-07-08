/**
 * Glove Manager – Inventory Reports (Overhauled & Simplified)
 *
 * This file retains the duplicate validation, known item number tracking,
 * and dialog submission handlers. All visual report generation code has been removed.
 */

// Property key for tracking known item numbers
var NEW_ITEMS_PROPERTY_KEY = 'knownItemNumbers';

/**
 * Checks if an item number is new (not previously tracked).
 * @param {string} itemNum - Item number to check
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @return {boolean} True if this is a new item number
 */
function isNewItemNumber(itemNum, sheetName) {
  if (!itemNum || String(itemNum).trim() === '') return false;

  var props = PropertiesService.getScriptProperties();
  var key = NEW_ITEMS_PROPERTY_KEY + '_' + sheetName;
  var knownItems = props.getProperty(key);

  // If no tracking exists for this sheet yet, initialize it EXCLUDING the current item
  // (since the item is already in the sheet by the time this check runs)
  // and return true (this IS a new item)
  if (!knownItems) {
    initializeKnownItemNumbers(sheetName, itemNum);  // Exclude current item
    return true;  // This is a new item since we never tracked this sheet before
  }

  var knownSet = knownItems ? knownItems.split(',') : [];
  return knownSet.indexOf(String(itemNum).trim()) === -1;
}

/**
 * Adds an item number to the known items list.
 * @param {string} itemNum - Item number to add
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 */
function addToKnownItemNumbers(itemNum, sheetName) {
  if (!itemNum || String(itemNum).trim() === '') return;

  var props = PropertiesService.getScriptProperties();
  var key = NEW_ITEMS_PROPERTY_KEY + '_' + sheetName;
  var knownItems = props.getProperty(key) || '';

  var knownSet = knownItems ? knownItems.split(',') : [];
  var itemStr = String(itemNum).trim();

  if (knownSet.indexOf(itemStr) === -1) {
    knownSet.push(itemStr);
    props.setProperty(key, knownSet.join(','));
  }
}

/**
 * Initializes the known item numbers from the current sheet data.
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {string} excludeItem - Optional item number to exclude (for new items being added)
 */
function initializeKnownItemNumbers(sheetName, excludeItem) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    PropertiesService.getScriptProperties().setProperty(NEW_ITEMS_PROPERTY_KEY + '_' + sheetName, '');
    return;
  }

  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
  var itemNums = [];
  var excludeItemStr = excludeItem ? String(excludeItem).trim() : '';

  data.forEach(function(row) {
    var itemNum = String(row[0]).trim();
    // Skip the excluded item (the one being added that triggered this initialization)
    if (itemNum && itemNums.indexOf(itemNum) === -1 && itemNum !== excludeItemStr) {
      itemNums.push(itemNum);
    }
  });

  PropertiesService.getScriptProperties().setProperty(NEW_ITEMS_PROPERTY_KEY + '_' + sheetName, itemNums.join(','));
  logEvent('Initialized known item numbers for ' + sheetName + ': ' + itemNums.length + ' items' + (excludeItemStr ? ' (excluding ' + excludeItemStr + ')' : ''));
}

/**
 * Resets the known item numbers tracking for all inventory sheets.
 */
function resetKnownItemNumbers() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Gloves');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Sleeves');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Blankets');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_HV Testers');
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Phasing Sets');

  initializeKnownItemNumbers('Gloves');
  initializeKnownItemNumbers('Sleeves');
  initializeKnownItemNumbers('Blankets');
  initializeKnownItemNumbers('HV Testers');
  initializeKnownItemNumbers('Phasing Sets');

  SpreadsheetApp.getUi().alert('✅ Known item numbers have been reset and re-initialized from current inventory.');
}

/**
 * Resets the known item numbers tracking for Blankets only.
 * Run this if the New Blanket dialog isn't showing.
 */
function resetBlanketTracking() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty(NEW_ITEMS_PROPERTY_KEY + '_Blankets');

  // Don't initialize - let it be empty so the next blanket is detected as "new"
  SpreadsheetApp.getUi().alert('✅ Blanket tracking has been reset.\n\nThe next blanket number you enter will trigger the New Blanket Entry dialog.');
}

/**
 * Prompts user when a new item number is detected in Gloves, Sleeves, or Blankets sheet.
 * Shows an HTML dialog with individual fields for all item details.
 * @param {string} itemNum - The new item number
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {number} rowNum - The row number where the item was added
 */
function promptNewItemSource(itemNum, sheetName, rowNum) {
  var itemType;
  var dialogTitle;

  if (sheetName === 'Gloves') {
    itemType = 'Glove';
    dialogTitle = '📦 New Glove Entry';
  } else if (sheetName === 'Sleeves') {
    itemType = 'Sleeve';
    dialogTitle = '📦 New Sleeve Entry';
  } else if (sheetName === 'Blankets') {
    itemType = 'Blanket';
    dialogTitle = '🧱 New Blanket Entry';
  } else if (sheetName === 'HV Testers') {
    itemType = 'HV Tester';
    dialogTitle = '⚡ New HV Tester Entry';
  } else if (sheetName === 'Phasing Sets') {
    itemType = 'Phasing Set';
    dialogTitle = '⚡ New Phasing Set Entry';
  } else if (sheetName === 'Hot Sticks') {
    itemType = 'Hot Stick';
    dialogTitle = '🪵 New Hot Stick Entry';
  } else if (sheetName === 'Grounds') {
    itemType = 'Ground';
    dialogTitle = '⚡ New Ground Entry';
  } else {
    itemType = 'Item';
    dialogTitle = '📦 New Item Entry';
  }

  var template = HtmlService.createTemplateFromFile('NewItemDialog');
  template.itemNum = itemNum;
  template.sheetName = sheetName;
  template.rowNum = rowNum;
  template.itemType = itemType;

  var html = template.evaluate()
    .setWidth(500)
    .setHeight(750);

  SpreadsheetApp.getUi().showModalDialog(html, dialogTitle);
}

/**
 * Processes the form submission from the New Item dialog.
 * Fills in the row data.
 * @param {Object} formData - Form data from the dialog
 * @param {string} itemNum - The item number
 * @param {string} sheetName - 'Gloves' or 'Sleeves'
 * @param {number} rowNum - The row number
 */
function processNewItemDialogSubmit(formData, itemNum, sheetName, rowNum) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  var isBlanket = (sheetName === 'Blankets');
  var isHVTester = (sheetName === 'HV Testers');
  var isPhasingSet = (sheetName === 'Phasing Sets');
  var isAED = (sheetName === 'AED');
  var isGrounds = (sheetName === 'Grounds');
  var isHotStick = (sheetName === 'Hot Sticks');
  var isMacks = (sheetName === 'MACKs');
  var itemType = sheetName === 'Gloves' ? 'Glove' : (sheetName === 'Sleeves' ? 'Sleeve' : (isBlanket ? 'Blanket' : (isMacks ? 'MACK' : (isHVTester ? 'HV Tester' : (isPhasingSet ? 'Phasing Set' : (isAED ? 'AED' : (isGrounds ? 'Ground' : (isHotStick ? 'Hot Stick' : 'Item'))))))));

  // ===========================================================================
  // DUPLICATE ITEM NUMBER VALIDATION
  // ===========================================================================
  // Check if this item number already exists (excluding the current row being edited)
  var duplicateCheck = checkDuplicateItemNumber(itemNum, sheetName);
  if (duplicateCheck.isDuplicate) {
    // Clear the item number from the cell
    sheet.getRange(rowNum, 1).clearContent();
    throw new Error('Item number "' + itemNum + '" already exists in row ' + duplicateCheck.existingRow + ' of the ' + sheetName + ' sheet.');
  }

  // ===========================================================================
  // HV TESTERS: A=Item#(1), B=Model(2), C=KV(3), D=Serial#(4),
  //             E=Calibration Date(5), F=Date Assigned(6), G=Location(7),
  //             H=Status(8), I=Assigned To(9), J=Change Out Date(10),
  //             K=Picked For(11), L=Notes(12)
  // ===========================================================================
  if (isHVTester) {
    if (formData.model) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.MODEL).setValue(formData.model);
    }
    if (formData.kv) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.KV).setValue(formData.kv);
    }
    if (formData.serialNum) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.SERIAL_NUM).setValue(formData.serialNum);
    }
    if (formData.calibrationDate) {
      var calCell = sheet.getRange(rowNum, COLS.HV_TESTERS.CALIBRATION_DATE);
      var parsedDate = parseDateNoon(formData.calibrationDate);
      if (parsedDate) {
        calCell.setValue(parsedDate);
        try { calCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        // Calculate Replacement Date = Calibration Date + 10 years
        var replacementDate = new Date(parsedDate);
        replacementDate.setFullYear(replacementDate.getFullYear() + (typeof INTERVAL_CALIBRATION_YEARS !== 'undefined' ? INTERVAL_CALIBRATION_YEARS : 10));
        var replCell = sheet.getRange(rowNum, COLS.HV_TESTERS.CHANGE_OUT_DATE);
        replCell.setValue(replacementDate);
        try { replCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.HV_TESTERS.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.HV_TESTERS.ASSIGNED_TO).setValue(assignedTo);
      // If assigned to employee, set Date Assigned & look up location
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, COLS.HV_TESTERS.DATE_ASSIGNED);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        sheet.getRange(rowNum, COLS.HV_TESTERS.STATUS).setValue('In Service');
        // Look up employee location
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.HV_TESTERS.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.HV_TESTERS.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.HV_TESTERS.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // PHASING SETS: A=Item#(1), B=Model(2), C=KV(3), D=Serial#(4),
  //               E=Calibration Date(5), F=Date Assigned(6), G=Location(7),
  //               H=Status(8), I=Assigned To(9), J=Replacement Date(10),
  //               K=Picked For(11), L=Notes(12)
  // ===========================================================================
  if (isPhasingSet) {
    if (formData.model) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.MODEL).setValue(formData.model);
    }
    if (formData.kv) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.KV).setValue(formData.kv);
    }
    if (formData.serialNum) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.SERIAL_NUM).setValue(formData.serialNum);
    }
    if (formData.calibrationDate) {
      var calCell = sheet.getRange(rowNum, COLS.PHASING_SETS.CALIBRATION_DATE);
      var parsedDate = parseDateNoon(formData.calibrationDate);
      if (parsedDate) {
        calCell.setValue(parsedDate);
        try { calCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        // Calculate Replacement Date = Calibration Date + 10 years
        var replacementDate = new Date(parsedDate);
        replacementDate.setFullYear(replacementDate.getFullYear() + (typeof INTERVAL_CALIBRATION_YEARS !== 'undefined' ? INTERVAL_CALIBRATION_YEARS : 10));
        var replCell = sheet.getRange(rowNum, COLS.PHASING_SETS.CHANGE_OUT_DATE);
        replCell.setValue(replacementDate);
        try { replCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.PHASING_SETS.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.PHASING_SETS.ASSIGNED_TO).setValue(assignedTo);
      // If assigned to employee, set Date Assigned & look up location
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, COLS.PHASING_SETS.DATE_ASSIGNED);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        sheet.getRange(rowNum, COLS.PHASING_SETS.STATUS).setValue('In Service');
        // Look up employee location
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.PHASING_SETS.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.PHASING_SETS.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.PHASING_SETS.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // AED: A=Item#(1), B=Model(2), C=(unused)(3), D=Pad Expiration(4),
  //      E=Date Assigned(5), F=Location(6), G=Status(7), H=Assigned To(8),
  //      I=(unused)(9), J=Picked For(10), K=Notes(11)
  // ===========================================================================
  if (isAED) {
    if (formData.model) {
      sheet.getRange(rowNum, COLS.AED.MODEL).setValue(formData.model);
    }
    if (formData.padExpiration) {
      var padCell = sheet.getRange(rowNum, COLS.AED.PAD_EXPIRATION);
      var parsedDate = parseDateNoon(formData.padExpiration);
      if (parsedDate) {
        padCell.setValue(parsedDate);
        try { padCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.AED.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.AED.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.AED.ASSIGNED_TO).setValue(assignedTo);
      // If assigned to employee, set Date Assigned & look up location
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, COLS.AED.DATE_ASSIGNED);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        sheet.getRange(rowNum, COLS.AED.STATUS).setValue('In Service');
        // Look up employee location
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.AED.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.AED.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.AED.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // GROUNDS: A=Serial#(1), B=Type(2), C=Size(3), D=KV(4), E=Length(5),
  //          F=Test Date(6), G=Date Assigned(7), H=Location(8), I=Status(9),
  //          J=Assigned To(10), K=Change Out Date(11), L=Picked For(12), M=Notes(13)
  // ===========================================================================
  if (isGrounds) {
    if (formData.groundType) {
      sheet.getRange(rowNum, COLS.GROUNDS.TYPE).setValue(formData.groundType);
    }
    if (formData.groundType === 'OH' && formData.groundSize) {
      sheet.getRange(rowNum, COLS.GROUNDS.SIZE).setValue(formData.groundSize);
      sheet.getRange(rowNum, COLS.GROUNDS.KV).clearContent();
    }
    if (formData.groundType === 'UG' && formData.groundKV) {
      sheet.getRange(rowNum, COLS.GROUNDS.KV).setValue(formData.groundKV);
      sheet.getRange(rowNum, COLS.GROUNDS.SIZE).clearContent();
    }
    var groundLength = formData.groundLength || (formData.groundType === 'UG' ? "6'" : '');
    if (groundLength) {
      sheet.getRange(rowNum, COLS.GROUNDS.LENGTH).setValue(groundLength);
    }
    if (formData.testDate) {
      var testDateCell = sheet.getRange(rowNum, COLS.GROUNDS.TEST_DATE);
      var parsedTestDate = parseDateNoon(formData.testDate);
      if (parsedTestDate) {
        testDateCell.setValue(parsedTestDate);
        try { testDateCell.setNumberFormat('MM/dd/yyyy'); SpreadsheetApp.flush(); } catch (fmtErr) {}
        // Calculate Change Out Date = Test Date + 12 months
        var changeOutDate = new Date(parsedTestDate);
        changeOutDate.setMonth(changeOutDate.getMonth() + (typeof INTERVAL_GROUNDS_TEST !== 'undefined' ? INTERVAL_GROUNDS_TEST : 12));
        var coCell = sheet.getRange(rowNum, COLS.GROUNDS.CHANGE_OUT_DATE);
        coCell.setValue(changeOutDate);
        try { coCell.setNumberFormat('MM/dd/yyyy'); SpreadsheetApp.flush(); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.GROUNDS.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.GROUNDS.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.GROUNDS.ASSIGNED_TO).setValue(assignedTo);
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, COLS.GROUNDS.DATE_ASSIGNED);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); SpreadsheetApp.flush(); } catch (fmtErr) {}
        sheet.getRange(rowNum, COLS.GROUNDS.STATUS).setValue('In Service');
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.GROUNDS.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.GROUNDS.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.GROUNDS.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // HOT STICKS: A=Item#(1), B=Type(2), C=Length(3), D=Test Date(4),
  //             E=Date Assigned(5), F=Location(6), G=Status(7), H=Assigned To(8),
  //             I=Change Out Date(9), J=Picked For(10), K=Notes(11)
  // ===========================================================================
  if (isHotStick) {
    if (formData.hotStickType) {
      sheet.getRange(rowNum, COLS.HOT_STICKS.TYPE).setValue(formData.hotStickType);
    }
    if (formData.hotStickLength) {
      sheet.getRange(rowNum, COLS.HOT_STICKS.LENGTH).setValue(formData.hotStickLength);
    }
    if (formData.hotStickTestDate) {
      var testDateCell = sheet.getRange(rowNum, COLS.HOT_STICKS.TEST_DATE);
      var parsedTestDate = parseDateNoon(formData.hotStickTestDate);
      if (parsedTestDate) {
        testDateCell.setValue(parsedTestDate);
        try { testDateCell.setNumberFormat('MM/dd/yyyy'); SpreadsheetApp.flush(); } catch (fmtErr) {}
        // Calculate Change Out Date = Test Date + 24 months (2-year cycle per OSHA 1910.269)
        var coDate = new Date(parsedTestDate);
        coDate.setMonth(coDate.getMonth() + (typeof INTERVAL_HOT_STICK_TEST !== 'undefined' ? INTERVAL_HOT_STICK_TEST : 24));
        var coCell = sheet.getRange(rowNum, COLS.HOT_STICKS.CHANGE_OUT_DATE);
        coCell.setValue(coDate);
        try { coCell.setNumberFormat('MM/dd/yyyy'); SpreadsheetApp.flush(); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, COLS.HOT_STICKS.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COLS.HOT_STICKS.STATUS).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, COLS.HOT_STICKS.ASSIGNED_TO).setValue(assignedTo);
      if (formData.hotStickDateAssigned) {
        var dateToUse = parseDateNoon(formData.hotStickDateAssigned);
        if (dateToUse) {
          var dateCell = sheet.getRange(rowNum, COLS.HOT_STICKS.DATE_ASSIGNED);
          dateCell.setValue(dateToUse);
          try { dateCell.setNumberFormat('MM/dd/yyyy'); SpreadsheetApp.flush(); } catch (fmtErr) {}
        }
      }
      if (assignedTo.toLowerCase() !== 'on shelf') {
        if (!formData.hotStickDateAssigned) {
          var dateCell2 = sheet.getRange(rowNum, COLS.HOT_STICKS.DATE_ASSIGNED);
          dateCell2.setValue(new Date());
          try { dateCell2.setNumberFormat('MM/dd/yyyy'); SpreadsheetApp.flush(); } catch (fmtErr) {}
        }
        sheet.getRange(rowNum, COLS.HOT_STICKS.STATUS).setValue('In Service');
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, COLS.HOT_STICKS.LOCATION).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, COLS.HOT_STICKS.ASSIGNED_TO).setValue('On Shelf');
      sheet.getRange(rowNum, COLS.HOT_STICKS.STATUS).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // MACKS: A=Item#(1), B=KV(2), C=Size(3), D=Length(4), E=Test Date(5),
  //        F=Date Assigned(6), G=Location(7), H=Status(8), I=Assigned To(9),
  //        J=Change Out Date(10), K=Picked For(11), L=Notes(12)
  // ===========================================================================
  if (isMacks) {
    if (formData.kv) {
      sheet.getRange(rowNum, 2).setValue(formData.kv);
    }
    if (formData.size) {
      sheet.getRange(rowNum, 3).setValue(formData.size);
    }
    if (formData.length) {
      sheet.getRange(rowNum, 4).setValue(formData.length);
    }
    if (formData.testDate) {
      var testDateCell = sheet.getRange(rowNum, 5);
      var parsedTestDate = parseDateNoon(formData.testDate);
      if (parsedTestDate) {
        testDateCell.setValue(parsedTestDate);
        try { testDateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        // Calculate Change Out Date = Test Date + 12 months
        var changeOutDate = new Date(parsedTestDate);
        changeOutDate.setMonth(changeOutDate.getMonth() + (typeof INTERVAL_MACK_TEST !== 'undefined' ? INTERVAL_MACK_TEST : 12));
        var coCell = sheet.getRange(rowNum, 10);
        coCell.setValue(changeOutDate);
        try { coCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
      }
    }
    if (formData.location) {
      sheet.getRange(rowNum, 7).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, 8).setValue(formData.status);
    }
    if (formData.assignedTo && formData.assignedTo.trim() !== '') {
      var assignedTo = formData.assignedTo.trim();
      sheet.getRange(rowNum, 9).setValue(assignedTo);
      // If assigned to employee, set Date Assigned & look up location
      if (assignedTo.toLowerCase() !== 'on shelf') {
        var today = new Date();
        var dateCell = sheet.getRange(rowNum, 6);
        dateCell.setValue(today);
        try { dateCell.setNumberFormat('MM/dd/yyyy'); } catch (fmtErr) {}
        sheet.getRange(rowNum, 8).setValue('In Service');
        // Look up employee location
        var empLoc = lookupEmployeeLocation(ss, assignedTo);
        if (empLoc) {
          sheet.getRange(rowNum, 7).setValue(empLoc);
        }
      }
    } else {
      sheet.getRange(rowNum, 9).setValue('On Shelf');
      sheet.getRange(rowNum, 8).setValue('On Shelf');
    }
    // Add to known items
    addToKnownItemNumbers(itemNum, sheetName);
    // Handle item source logging
    processItemSourceLogging(formData, itemNum, itemType, sheetName, ss);
    return;
  }

  // ===========================================================================
  // GLOVES / SLEEVES / BLANKETS (original logic)
  // Use appropriate COLS namespace: INVENTORY for Gloves/Sleeves, BLANKETS for Blankets
  // ===========================================================================
  var COL = isBlanket ? COLS.BLANKETS : COLS.INVENTORY;

  // Fill in the basic data
  if (formData.size) {
    sheet.getRange(rowNum, isBlanket ? COL.TYPE : COL.SIZE).setValue(formData.size);
  }

  if (formData.itemClass) {
    sheet.getRange(rowNum, COL.CLASS).setValue(formData.itemClass);
  }

  if (formData.testDate) {
    var testDateCell = sheet.getRange(rowNum, COL.TEST_DATE);
    var parsedTestDate = parseDateNoon(formData.testDate);
    if (parsedTestDate) {
      testDateCell.setValue(parsedTestDate);
      try {
        testDateCell.setNumberFormat('MM/dd/yyyy');
      } catch (fmtErr) { /* Ignore format errors on typed columns */ }
    }
  }

  // Handle ESL ID for Gloves/Sleeves
  if (!isBlanket && formData.eslId) {
    sheet.getRange(rowNum, COL.ESL_ID).setValue(formData.eslId);
  }

  // Handle Assigned To - this triggers location/status updates and Change Out Date calculation
  if (formData.assignedTo && formData.assignedTo.trim() !== '') {
    var assignedTo = formData.assignedTo.trim();
    var assignedToLower = assignedTo.toLowerCase();

    // Check if "Assigned To" is a status value rather than an employee name
    // Different status values for Blankets vs Gloves/Sleeves
    var statusValuesGloves = ['on shelf', 'in testing', 'ready for delivery', 'ready for test', 'lost', 'failed rubber', 'failed'];
    var statusValuesBlankets = ['on shelf', 'in service', 'in testing', 'lost', 'failed'];
    var statusValues = isBlanket ? statusValuesBlankets : statusValuesGloves;
    var isStatusValue = statusValues.indexOf(assignedToLower) !== -1;

    if (isStatusValue) {
      // This is a status value, not an employee assignment
      sheet.getRange(rowNum, COL.ASSIGNED_TO).setValue(assignedTo);

      // Set Status based on the form's status field (which should match)
      var statusToSet = formData.status || assignedTo;
      sheet.getRange(rowNum, COL.STATUS).setValue(statusToSet);

      // Set Location from form or default to Helena for On Shelf items
      if (formData.location && formData.location.trim() !== '') {
        sheet.getRange(rowNum, COL.LOCATION).setValue(formData.location.trim());
      } else if (assignedToLower === 'on shelf') {
        sheet.getRange(rowNum, COL.LOCATION).setValue('Helena');
      }

      // Set Date Assigned to today for tracking purposes
      var today = new Date();
      var dateAssignedCell = sheet.getRange(rowNum, COL.DATE_ASSIGNED);
      dateAssignedCell.setValue(today);
      try {
        dateAssignedCell.setNumberFormat('MM/dd/yyyy');
      } catch (fmtErr) { /* Ignore format errors on typed columns */ }

      // Calculate Change Out Date based on test date (only for non-failed/lost items)
      if (formData.testDate && assignedToLower !== 'lost' && assignedToLower !== 'failed' && assignedToLower !== 'failed rubber') {
        var isSleeve = (sheetName === 'Sleeves');
        var location = sheet.getRange(rowNum, COL.LOCATION).getValue();
        var changeOutDate = calculateChangeOutDate(today, location, assignedTo, isSleeve);
        if (changeOutDate) {
          var changeOutCell = sheet.getRange(rowNum, COL.CHANGE_OUT_DATE);
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
          changeOutCell.setValue(changeOutDate);
        }
      }

    } else {
      // This is an actual employee assignment
      sheet.getRange(rowNum, COL.ASSIGNED_TO).setValue(assignedTo);

      // Set Date Assigned to today
      var today = new Date();
      var dateAssignedCell = sheet.getRange(rowNum, COL.DATE_ASSIGNED);
      dateAssignedCell.setValue(today);
      try {
        dateAssignedCell.setNumberFormat('MM/dd/yyyy');
      } catch (fmtErr) { /* Ignore format errors on typed columns */ }

      // Set Status - "In Service" for Blankets, "Assigned" for Gloves/Sleeves
      var assignedStatus = isBlanket ? 'In Service' : 'Assigned';
      sheet.getRange(rowNum, COL.STATUS).setValue(assignedStatus);

      // Look up employee's location from Employees sheet
      var employeesSheet = ss.getSheetByName('Employees');
      if (employeesSheet && employeesSheet.getLastRow() > 1) {
        var empData = employeesSheet.getDataRange().getValues();
        var empHeaders = empData[0];
        var nameCol = -1;
        var locCol = -1;

        for (var h = 0; h < empHeaders.length; h++) {
          var hdr = String(empHeaders[h]).toLowerCase().trim();
          if (hdr === 'name') nameCol = h;
          if (hdr === 'location') locCol = h;
        }

        if (nameCol !== -1 && locCol !== -1) {
          for (var i = 1; i < empData.length; i++) {
            var empName = String(empData[i][nameCol]).trim().toLowerCase();
            if (empName === assignedTo.toLowerCase()) {
              var empLocation = String(empData[i][locCol]).trim();
              if (empLocation) {
                sheet.getRange(rowNum, COL.LOCATION).setValue(empLocation);
              }
              break;
            }
          }
        }
      }

      // Calculate and set Change Out Date (for Gloves/Sleeves, not Blankets)
      if (!isBlanket) {
        var isSleeve = (sheetName === 'Sleeves');
        var location = sheet.getRange(rowNum, COL.LOCATION).getValue();
        var changeOutDate = calculateChangeOutDate(today, location, assignedTo, isSleeve);

        if (changeOutDate) {
          var changeOutCell = sheet.getRange(rowNum, COL.CHANGE_OUT_DATE);
          try {
            if (changeOutDate === 'N/A') {
              changeOutCell.setNumberFormat('@');
            } else {
              changeOutCell.setNumberFormat('MM/dd/yyyy');
            }
          } catch (fmtErr) { /* Ignore format errors on typed columns */ }
          changeOutCell.setValue(changeOutDate);
        }
      }
    }

  } else {
    // Not assigned - just set location and status from form
    if (formData.location) {
      sheet.getRange(rowNum, COL.LOCATION).setValue(formData.location);
    }
    if (formData.status) {
      sheet.getRange(rowNum, COL.STATUS).setValue(formData.status);
    }
  }
}

// =============================================================================
// DUPLICATE ITEM NUMBER PROTECTION
// =============================================================================

/**
 * Checks if an item number already exists in a sheet (excluding the current row).
 * @param {string} itemNum - Item number to check
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {number} excludeRow - Row to exclude from check (the current row being edited)
 * @return {Object} {isDuplicate: boolean, existingRow: number or null}
 */
function checkDuplicateItemNumber(itemNum, sheetName, excludeRow) {
  if (!itemNum || String(itemNum).trim() === '') {
    return { isDuplicate: false, existingRow: null };
  }

  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);

  if (!sheet || sheet.getLastRow() < 2) {
    return { isDuplicate: false, existingRow: null };
  }

  var itemNumStr = String(itemNum).trim().toUpperCase();
  var data = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();

  for (var i = 0; i < data.length; i++) {
    var rowNum = i + 2;
    if (rowNum === excludeRow) continue;

    var existingItemNum = String(data[i][0] || '').trim().toUpperCase();
    if (existingItemNum === itemNumStr) {
      return { isDuplicate: true, existingRow: rowNum };
    }
  }

  return { isDuplicate: false, existingRow: null };
}

/**
 * Handles duplicate item number detection and warns the user.
 * Called from the onEdit trigger when an item number is entered.
 * @param {string} itemNum - Item number entered
 * @param {string} sheetName - 'Gloves', 'Sleeves', or 'Blankets'
 * @param {number} currentRow - Current row being edited
 * @return {boolean} True if duplicate was found and handled
 */
function handleDuplicateItemNumber(itemNum, sheetName, currentRow) {
  var result = checkDuplicateItemNumber(itemNum, sheetName, currentRow);

  if (result.isDuplicate) {
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getSheetByName(sheetName);

    sheet.getRange(currentRow, 1).setValue('');

    var ui = SpreadsheetApp.getUi();
    ui.alert(
      '⚠️ Duplicate Item Number',
      'Item number "' + itemNum + '" already exists in row ' + result.existingRow + ' of the ' + sheetName + ' sheet.\n\n' +
      'Please use a unique item number.',
      ui.ButtonSet.OK
    );

    return true;
  }

  return false;
}

/**
 * Handles item source logging after a new item is added via the NewItemDialog.
 * @param {Object} formData - Form data from the dialog
 * @param {string} itemNum - The item number that was added
 * @param {string} itemType - e.g. 'glove', 'sleeve', 'hv_tester', 'aed', etc.
 * @param {string} sheetName - Sheet the item was added to
 * @param {Spreadsheet} ss - Active spreadsheet
 */
function processItemSourceLogging(formData, itemNum, itemType, sheetName, ss) {
  var source = 'Purchased';
  if (formData.itemSource === '2') {
    source = 'Reclaimed';
  } else if (formData.itemSource === '3') {
    ss.toast('Item #' + itemNum + ' added', '✅ Item Added', 5);
    return;
  }

  ss.toast('Item #' + itemNum + ' added as ' + source, '✅ Item Added', 3);
}
