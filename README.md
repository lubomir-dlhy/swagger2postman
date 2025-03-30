# Swagger2Postman

A tool to convert Swagger/OpenAPI specifications to Postman collections and update them.

## Features

- Convert Swagger/OpenAPI specs to Postman collections
- Support for both URL and local file sources
- Multiple merge strategies for updating existing collections
- Configuration via CLI arguments or config file

## Installation

```bash
npm install -g @dlhyl/swagger2postman
```

## Usage

### Command Line Interface

```bash
swagger2postman [options]
```

Available options:

Required (if not using config file):

- `--collection-name <name>` - Collection name
- Either `--url <url>` or `--file-path <path>` - Swagger source

Optional:

- `-c, --config <path>` - Path to config file (defaults to ./swagger2postman.config.js)
- `--workspace-name <name>` - Workspace name (uses default if not specified)
- `--merge-mode <mode>` - Merge mode (preserve_postman, preserve_swagger, replace)
- `--postman-api-key <key>` - Postman API key

### Configuration File

By default, the tool looks for `swagger2postman.config.js` in the current working directory. You can override this by providing a custom path with the `-c` option.

Create a `swagger2postman.config.js` file:

```javascript
module.exports = {
  collectionName: "My API",
  workspaceName: "My Workspace", // optional
  url: "https://api.example.com/swagger.json", // either url or filePath is required
  // filePath: "./swagger.json", // alternative to url
  mergeMode: "preserve_postman", // optional
  postmanApiKey: "your-api-key", // optional, can also be set via environment variable
};
```

### Authentication

The Postman API key can be provided in three ways (in order of precedence):

1. Command line argument: `--postman-api-key <key>`
2. Config file: `postmanApiKey` property
3. Environment variable: `POSTMAN_API_KEY`

### Merge Modes

When updating existing collections, three merge modes are available:

- `preserve_postman` (default): Keep existing Postman collection modifications, Swagger/OpenAPI does not override attributes, but only adds new
- `preserve_swagger`: Override with Swagger/OpenAPI definitions, Swagger/OpenAPI override changed attributes
- `replace`: Completely replace the collection with Swagger/OpenAPI definition, removes added or changed attributes

### Examples

```bash
# Using default config file (./swagger2postman.config.js)
swagger2postman

# Basic usage with URL
swagger2postman --collection-name "My API" --url "https://api.example.com/swagger.json"

# Using local swagger file
swagger2postman --collection-name "My API" --file-path "./swagger.json"

# Specifying workspace and merge mode
swagger2postman --collection-name "My API" --workspace-name "My Workspace" --url "https://api.example.com/swagger.json" --merge-mode preserve_swagger

# Using API key via CLI
swagger2postman --collection-name "My API" --url "https://api.example.com/swagger.json" --postman-api-key "PMAK-..."

# Complete example with all optional parameters
swagger2postman --collection-name "My API" --workspace-name "My Workspace" --url "https://api.example.com/swagger.json" --merge-mode replace --postman-api-key "PMAK-..."
```

Using a config file:

```bash
swagger2postman -c ./config/swagger2postman.config.js
```

Using environment variable for API key:

```bash
POSTMAN_API_KEY=your-api-key swagger2postman --collection-name "My API" --url "https://api.example.com/swagger.json"
```

## License

MIT
