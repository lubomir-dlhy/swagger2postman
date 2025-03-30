#!/usr/bin/env node
import dotenv from "dotenv";
import { Command } from "commander";
import fs from "fs";
import path from "path";
import * as collection from "./lib/collection";
import * as workspace from "./lib/workspace";
import fetch from "./lib/fetch";
import { merge, CollectionData, MergeMode } from "./lib/merger";

interface IServiceConfig {
  collectionName: string;
  workspaceName: string;
  url?: string;
  filePath?: string;
  mergeMode?: MergeMode;
}

// Initialize environment variables
dotenv.config();

const converter = require("openapi-to-postmanv2");

// Setup command-line interface
const program = new Command();
program
  .version("1.0.0")
  .option("-c, --config <path>", "path to config file")
  .option("--collection-name <name>", "collection name")
  .option("--workspace-name <name>", "workspace name")
  .option("--url <url>", "swagger URL")
  .option("--file-path <path>", "path to swagger file")
  .option("--merge-mode <mode>", "merge mode (preserve_postman, preserve_swagger, replace)")
  .parse(process.argv);

const options = program.opts();

// Function to load config file
function loadConfigFile(configPath: string): IServiceConfig | undefined {
  try {
    const absolutePath = path.resolve(configPath);
    if (!fs.existsSync(absolutePath)) {
      return undefined;
    }
    const config = require(absolutePath);
    return config;
  } catch (err) {
    const error = err as Error;
    console.error(`Error loading config file: ${error.message}`);
    return undefined;
  }
}

function validateMergeMode(mode: string): MergeMode | undefined {
  if (!mode) return undefined;
  const normalizedMode = mode.toLowerCase();
  switch (normalizedMode) {
    case "preserve_postman":
      return MergeMode.PRESERVE_POSTMAN;
    case "preserve_swagger":
      return MergeMode.PRESERVE_SWAGGER;
    case "replace":
      return MergeMode.REPLACE;
    default:
      return undefined;
  }
}

// Function to get configuration
function getConfig(): IServiceConfig {
  // If direct parameters are provided, use them
  if (options.collectionName || options.url || options.filePath) {
    const config: IServiceConfig = {
      collectionName: options.collectionName,
      workspaceName: options.workspaceName || "",
      url: options.url,
      filePath: options.filePath,
      mergeMode: validateMergeMode(options.mergeMode),
    };
    return validateServiceConfig(config);
  }

  // Try to load config file
  const configPath = options.config || path.join(process.cwd(), "swagger2postman.config.js");
  const config = loadConfigFile(configPath);

  if (!config) {
    console.error("No configuration found. Please provide either command line parameters or a config file.");
    process.exit(1);
  }

  // Override merge mode if provided in CLI
  if (options.mergeMode) {
    const cliMergeMode = validateMergeMode(options.mergeMode);
    if (cliMergeMode) {
      config.mergeMode = cliMergeMode;
    }
  }

  return validateServiceConfig(config);
}

// Function to validate service configuration
function validateServiceConfig(config: IServiceConfig): IServiceConfig {
  if (!config.collectionName) {
    console.error("Configuration must include collectionName");
    process.exit(1);
  }
  if (config.workspaceName && typeof config.workspaceName !== "string") {
    console.error("Configuration workspaceName must be a string");
    process.exit(1);
  }
  if (!config.url && !config.filePath) {
    console.error("Configuration must include either url or filePath");
    process.exit(1);
  }
  if (config.url && config.filePath) {
    console.error("Configuration must include either url or filePath, not both");
    process.exit(1);
  }
  if (config.url && !config.url.startsWith("http")) {
    console.error("Configuration url must start with http or https");
    process.exit(1);
  }
  if (config.filePath && !fs.existsSync(config.filePath)) {
    console.error(`Configuration filePath does not exist: ${config.filePath}`);
    process.exit(1);
  }
  if (config.mergeMode && !Object.values(MergeMode).includes(config.mergeMode)) {
    const validModes = Object.values(MergeMode).join(", ");
    console.error(`Invalid merge mode. Must be one of: ${validModes}`);
    process.exit(1);
  }
  return config;
}

const config = getConfig();
const collectionName = config.collectionName;

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
    const swaggerJson = await getSwaggerJson(config);

    // Enhance swagger info
    swaggerJson.info = {
      ...swaggerJson.info,
      title: collectionName,
      description: `${collectionName} API`,
    };

    // Convert swagger to Postman collection
    const convertedJson = await convertSwaggerToPostman(swaggerJson);

    // Get or create workspace if workspaceName is provided
    let workspaceId = "";
    if (config.workspaceName) {
      console.log(`Looking for workspace: "${config.workspaceName}"`);
      workspaceId = await workspace.getOrCreateWorkspace(config.workspaceName, `Workspace for ${config.workspaceName} API`);
    }

    // Get or create collection ID (now using the resolved workspaceId)
    let id = await collection.getCollectionId(collectionName, workspaceId);
    let isNewCollection = false;

    if (id === null) {
      console.log(`Collection "${collectionName}" not found, creating a new one...`);
      try {
        // Use the resolved workspaceId
        id = await collection.createCollection(collectionName, `${collectionName} API`, workspaceId);
        console.log(`Collection created successfully${workspaceId ? ` in workspace: ${config.workspaceName}` : ""}`);
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

      // Ensure savedCollection has proper structure
      if (!Array.isArray(savedCollection.collection.item)) {
        savedCollection.collection.item = [];
      }

      // Merge and update the collection with specified merge mode
      mergedCollection = merge(collectionJson, savedCollection, config.mergeMode);
    }

    await collection.updateCollection(id, mergedCollection);

    console.log(`Successfully ${isNewCollection ? "created" : "updated"} ${collectionName} collection`);
  } catch (error: any) {
    if (error.message) {
      console.error(`Update failed: ${error.message}`);
    } else {
      console.error("An unknown error occurred during the update process.");
    }
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
