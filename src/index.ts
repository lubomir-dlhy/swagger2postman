#!/usr/bin/env node
import dotenv from "dotenv";
import { Command } from "commander";
import path from "path";
import fs from "fs";
import * as collection from "./lib/collection";
import * as workspace from "./lib/workspace";
import fetch from "./lib/fetch";
import { merge, CollectionData } from "./lib/merger";
import config from "config";

interface IServiceConfig {
  collectionName: string;
  workspaceName: string;
  url?: string;
  filePath?: string;
}

// Initialize environment variables
dotenv.config();

// Suppress config warnings
process.env.SUPPRESS_NO_CONFIG_WARNING = "y";

// Import converter
const converter = require("openapi-to-postmanv2");

// Setup command-line interface
const program = new Command();
program
  .version("1.0.0")
  .option("-s --service <service>", "which service to convert")
  .option("-r --replace [replaces]", "comma split api name which will replace not merge")
  .parse(process.argv);

const options = program.opts();

console.log(`Service: ${options.service}`);

if (!options.service || !config.get(options.service)) {
  console.error("Service configuration not found");
  process.exit(1);
}

const serviceConfig = config.get(options.service) as IServiceConfig;
const collectionName = serviceConfig.collectionName;

// Run update
update().catch((err) => {
  console.error(`Update failed: ${err.message}`);
  process.exit(1);
});

/**
 * Get swagger JSON from a URL
 */
async function getSwaggerJsonFromUrl(url: string): Promise<any> {
  try {
    const response = await fetch({
      url,
      method: "get",
    });
    return response.data;
  } catch (err) {
    console.error(`Failed to fetch Swagger from URL: ${url}`);
    throw err;
  }
}

/**
 * Get swagger JSON from a file
 */
async function getSwaggerJsonFromFile(filePath: string): Promise<any> {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    return JSON.parse(content);
  } catch (err) {
    console.error(`Failed to read Swagger from file: ${filePath}`);
    throw err;
  }
}

/**
 * Get swagger JSON from either URL or file based on service config
 */
async function getSwaggerJson(config: IServiceConfig): Promise<any> {
  if (config.url) {
    return getSwaggerJsonFromUrl(config.url);
  } else if (config.filePath) {
    return getSwaggerJsonFromFile(config.filePath);
  } else {
    throw new Error("Service configuration must include either url or filePath");
  }
}

/**
 * Convert swagger to Postman collection
 */
function convertSwaggerToPostman(swaggerJson: any): Promise<any> {
  return new Promise((resolve, reject) => {
    const converterInputData = {
      type: "json",
      data: swaggerJson,
    };

    converter.convert(
      converterInputData,
      { folderStrategy: "Paths", collapseFolders: false, requestParametersResolution: "Example", enableOptionalParameters: false },
      (err: any, result: any) => {
        if (err) {
          return reject(err);
        }

        if (result.result === false) {
          return reject(new Error(`Conversion failed: ${result.reason}`));
        }

        resolve(result.output[0].data);
      }
    );
  });
}

async function update(): Promise<void> {
  try {
    // Get swagger JSON from URL or file
    const swaggerJson = await getSwaggerJson(serviceConfig);

    // Enhance swagger info
    swaggerJson.info = {
      ...swaggerJson.info,
      title: collectionName,
      description: `${collectionName} API`,
    };

    // Convert swagger to Postman collection
    const convertedJson = await convertSwaggerToPostman(swaggerJson);

    fs.writeFileSync("convertedCollection.json", JSON.stringify(convertedJson, null, 2));

    // Get or create workspace if workspaceName is provided
    let workspaceId = "";
    if (serviceConfig.workspaceName) {
      console.log(`Looking for workspace: "${serviceConfig.workspaceName}"`);
      workspaceId = await workspace.getOrCreateWorkspace(serviceConfig.workspaceName, `Workspace for ${serviceConfig.workspaceName} API`);
    }

    // Get or create collection ID (now using the resolved workspaceId)
    let id = await collection.getCollectionId(collectionName, workspaceId);
    let isNewCollection = false;

    if (id === null) {
      console.log(`Collection "${collectionName}" not found, creating a new one...`);
      try {
        // Use the resolved workspaceId
        id = await collection.createCollection(collectionName, `${collectionName} API`, workspaceId);
        console.log(`Collection created successfully${workspaceId ? ` in workspace: ${serviceConfig.workspaceName}` : ""}`);
        isNewCollection = true;
      } catch (createError: any) {
        console.error(`Failed to create collection: ${createError.message}`);
        throw createError;
      }
    }

    // Prepare new collection data
    const collectionJson: CollectionData = {
      collection: {
        info: {
          name: collectionName,
          description: `${collectionName} API`,
          _postman_id: id,
          schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
        },
        item: convertedJson.item,
      },
    };

    let mergedCollection;

    if (isNewCollection) {
      // For new collections, just use the converted data directly
      mergedCollection = collectionJson;
    } else {
      // Get existing collection and merge
      const savedCollection = await collection.getCollectionDetail(id);
      fs.writeFileSync("savedCollection.json", JSON.stringify(savedCollection, null, 2));

      // Ensure savedCollection has proper structure
      if (!Array.isArray(savedCollection.collection.item)) {
        savedCollection.collection.item = [];
      }

      // Merge and update the collection
      mergedCollection = merge(savedCollection, collectionJson);
    }

    await collection.updateCollection(id, mergedCollection);

    console.log(`Successfully ${isNewCollection ? "created" : "updated"} ${collectionName} collection`);
  } catch (error: any) {
    console.error(`Update failed: ${error.message}`);
    if (error.message?.includes("not permitted")) {
      console.error("Permission error: You don't have sufficient permissions to perform this action.");
      console.error("Solutions:");
      console.error("1. Verify your API key has the required permissions");
      console.error("2. Use a different workspace where you have write permissions");
      console.error("3. Ask the workspace administrator to grant you the necessary permissions");
    }
    process.exit(1);
  }
}
