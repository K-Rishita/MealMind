const admin = require('firebase-admin');
const fs = require('fs');

// --- 1. CONFIGURATION ---
const SERVICE_ACCOUNT_PATH = process.env.SERVICE_ACCOUNT_PATH || 'serviceAccountKey.json'; // Path to the key file (git-ignored)
const DATA_FILE_PATH = 'Recipes.json'; // Path to your JSON data file
const TARGET_COLLECTION = 'Recipes';                         // The Firestore collection name

// --- 2. INITIALIZE FIREBASE ADMIN SDK ---
const serviceAccount = JSON.parse(fs.readFileSync(SERVICE_ACCOUNT_PATH, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

// --- REFERENCE CONVERSION UTILITY ---
/**
 * Recursively walks a data object to find and convert JSON reference structures
 * ({ referenceValue: 'path/to/doc' }) into native DocumentReference objects.
 * * @param {object} data The object to traverse.
 * @returns {object} The object with converted references.
 */
function convertReferences(data) {
  // If the data is an array, map over its elements and recurse
  if (Array.isArray(data)) {
    return data.map(item => convertReferences(item));
  }
  
  // If the data is an object, check for the referenceValue key
  if (typeof data === 'object' && data !== null) {
    // 1. Check if this specific object is a reference wrapper
    if (data.referenceValue && typeof data.referenceValue === 'string') {
      // It matches our expected structure, convert the relative path to a DocumentReference
      return db.doc(data.referenceValue);
    }
    
    // 2. If it's a map (generic object), recurse through its fields
    const newData = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        newData[key] = convertReferences(data[key]);
      }
    }
    return newData;
  }
  
  // Return primitives (strings, numbers, booleans) unchanged
  return data;
}

// --- 3. IMPORT FUNCTION ---
async function importData() {
  try {
    // Note: The Canvas JSON is now a top-level array, matching this expectation.
    const dataToImport = JSON.parse(fs.readFileSync(DATA_FILE_PATH, 'utf8'));
    
    if (!Array.isArray(dataToImport)) {
        console.error("Error: JSON file must contain a top-level array of documents.");
        // We throw here now as the JSON file has been fixed.
        throw new Error("Input file must be a JSON array.");
    }
    
    console.log(`Starting import of ${dataToImport.length} documents into '${TARGET_COLLECTION}'...`);

    const batch = db.batch();
    
    dataToImport.forEach((docData) => {
      // **CRITICAL FIX:** Convert string references to DocumentReference objects
      const finalDocData = convertReferences(docData);
      
      // Create a new document reference with an auto-generated ID
      const docRef = db.collection(TARGET_COLLECTION).doc();
      batch.set(docRef, finalDocData);
    });

    await batch.commit();
    
    console.log('✅ Data import complete!');

  } catch (error) {
    console.error('❌ Import failed:', error.message);
  }
}

importData();