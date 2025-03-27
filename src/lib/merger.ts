interface Item {
  name: string;
  item?: Item[];
  _postman_id?: string;
  id?: string;
  [key: string]: any;
}

interface CollectionData {
  collection: {
    info: {
      name: string;
      [key: string]: any;
    };
    item: Item[];
    [key: string]: any;
  };
  [key: string]: any;
}

interface CollectionMap {
  items: Map<string, Item>; // Individual items at this level
  folders: Map<string, { folderItem: Item; map: CollectionMap }>; // Nested folders
  source: string; // "swagger" or "postman"
}

/**
 * Merges a Swagger-generated collection with a Postman collection
 * @param localSwaggerCollection The collection generated from Swagger
 * @param remotePostmanCollection The collection from Postman
 * @returns A merged collection that preserves Postman metadata and includes Swagger updates
 */
function merge(localSwaggerCollection: CollectionData, remotePostmanCollection: CollectionData): CollectionData {
  console.log("Starting merge between Swagger and Postman collections");

  // Create a new merged collection with Postman metadata
  const mergedCollection: CollectionData = {
    collection: {
      ...remotePostmanCollection.collection,
      item: [], // Will be populated during merge
    },
  };

  // Build collection maps
  const swaggerMap = buildCollectionMap(localSwaggerCollection, "swagger");
  const postmanMap = buildCollectionMap(remotePostmanCollection, "postman");

  // Perform the merge
  mergedCollection.collection.item = mergeCollectionMaps(postmanMap, swaggerMap);

  // Ensure all IDs are properly set
  processIds(mergedCollection);

  console.log("Merge completed successfully");
  return mergedCollection;
}

/**
 * Creates a map representation of a collection for easier merging
 */
function buildCollectionMap(collection: CollectionData, source: string): CollectionMap {
  const rootMap: CollectionMap = {
    items: new Map(),
    folders: new Map(),
    source,
  };

  if (!collection?.collection?.item) {
    console.warn(`Invalid ${source} collection structure`);
    return rootMap;
  }

  // Process collection items recursively
  processItems(collection.collection.item, rootMap);
  return rootMap;
}

/**
 * Recursively processes items to build the collection map
 */
function processItems(items: Item[], parentMap: CollectionMap): void {
  for (const item of items) {
    // Mark item source
    item._source = parentMap.source;

    if (!item.item || item.item.length === 0) {
      // This is an endpoint/request item
      parentMap.items.set(item.name, item);
    } else {
      // This is a folder
      const folderMap: CollectionMap = {
        items: new Map(),
        folders: new Map(),
        source: parentMap.source,
      };

      // Process items in the folder
      processItems(item.item, folderMap);

      // Store the folder
      parentMap.folders.set(item.name, {
        folderItem: item,
        map: folderMap,
      });
    }
  }
}

/**
 * Merges two collection maps, prioritizing Postman structure but updating with Swagger data
 */
function mergeCollectionMaps(postmanMap: CollectionMap, swaggerMap: CollectionMap): Item[] {
  const result: Item[] = [];
  const processedSwaggerItems = new Set<string>();

  // Process Postman items first
  postmanMap.items.forEach((postmanItem, itemName) => {
    // Check if this item exists in Swagger
    if (swaggerMap.items.has(itemName)) {
      // Merge the items, keeping Postman metadata
      const swaggerItem = swaggerMap.items.get(itemName)!;
      const mergedItem = mergeItems(postmanItem, swaggerItem);
      result.push(mergedItem);
      processedSwaggerItems.add(itemName);
    } else {
      // Keep Postman-only item
      result.push(postmanItem);
    }
  });

  // Process Postman folders
  postmanMap.folders.forEach((postmanFolder, folderName) => {
    if (swaggerMap.folders.has(folderName)) {
      // This folder exists in both collections
      const swaggerFolder = swaggerMap.folders.get(folderName)!;

      // Create a merged folder
      const mergedFolder = { ...postmanFolder.folderItem };
      mergedFolder._merged = true;

      // Recursively merge folder contents
      mergedFolder.item = mergeCollectionMaps(postmanFolder.map, swaggerFolder.map);
      result.push(mergedFolder);

      processedSwaggerItems.add(folderName);
    } else {
      // Keep Postman-only folder
      result.push(postmanFolder.folderItem);
    }
  });

  // Add remaining Swagger items (that don't exist in Postman)
  swaggerMap.items.forEach((item, name) => {
    if (!processedSwaggerItems.has(name)) {
      result.push(item);
    }
  });

  // Add remaining Swagger folders
  swaggerMap.folders.forEach((folder, name) => {
    if (!processedSwaggerItems.has(name)) {
      result.push(folder.folderItem);
    }
  });

  // Sort by name for consistency
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

/**
 * Merges two items, preserving Postman metadata but updating with Swagger definitions
 */
function mergeItems(postmanItem: Item, swaggerItem: Item): Item {
  const mergedItem = { ...postmanItem };

  // Update with Swagger request information
  mergedItem.request = swaggerItem.request || mergedItem.request;

  // Keep Postman examples if available, otherwise use Swagger examples
  if (!mergedItem.response || mergedItem.response.length === 0) {
    mergedItem.response = swaggerItem.response;
  }

  // Update description and other metadata
  mergedItem.description = swaggerItem.description || mergedItem.description;

  // Preserve Postman IDs
  mergedItem._postman_id = postmanItem._postman_id;
  mergedItem.id = postmanItem.id || swaggerItem.id;

  // Mark as merged
  mergedItem._merged = true;

  return mergedItem;
}

/**
 * Ensures all items in the collection have proper IDs
 */
function processIds(collection: CollectionData): void {
  if (!collection?.collection?.item) return;

  function processItemIds(items: Item[]): void {
    items.forEach((item) => {
      // Ensure ID consistency
      if (item._postman_id) {
        item.id = item._postman_id;
      }

      // Process children if this is a folder
      if (item.item && item.item.length > 0) {
        processItemIds(item.item);
      }
    });
  }

  processItemIds(collection.collection.item);
}

export { merge, CollectionData };
