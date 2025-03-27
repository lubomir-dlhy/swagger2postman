import fetch from "./fetch";

interface Workspace {
  id: string;
  name: string;
  type: string;
  [key: string]: any;
}

/**
 * Get all available workspaces
 */
function getWorkspaces(): Promise<Workspace[]> {
  return fetch({
    url: "/workspaces",
    method: "get",
  })
    .then((response) => {
      return response.data.workspaces;
    })
    .catch((err) => {
      console.error("Get workspaces failed: " + err);
      process.exit(-1);
    });
}

/**
 * Find a workspace by name
 */
function findWorkspace(name: string): Promise<Workspace | null> {
  return getWorkspaces()
    .then((workspaces) => {
      const workspace = workspaces.find((ws) => ws.name === name);
      if (workspace) {
        console.log(`Found workspace "${name}" with ID: ${workspace.id}`);
        return workspace;
      }
      console.log(`Workspace "${name}" not found`);
      return null;
    })
    .catch((err) => {
      console.error("Find workspace failed: " + err);
      process.exit(-1);
    });
}

/**
 * Create a new workspace
 */
function createWorkspace(name: string, description?: string): Promise<Workspace> {
  const data = {
    workspace: {
      name,
      description: description || `Workspace for ${name}`,
      type: "personal", // personal or team
    },
  };

  return fetch({
    url: "/workspaces",
    method: "post",
    data,
  })
    .then((response) => {
      console.log(`Workspace "${name}" created with ID: ${response.data.workspace.id}`);
      return response.data.workspace;
    })
    .catch((err) => {
      console.error("Create workspace failed: " + err);
      if (err.toString().includes("not permitted")) {
        console.error("You don't have permission to create workspaces. Using default workspace instead.");
        return { id: "", name: "My Workspace", type: "personal" };
      }
      process.exit(-1);
    });
}

/**
 * Get or create a workspace by name
 */
async function getOrCreateWorkspace(name: string, description?: string): Promise<string> {
  try {
    // Try to find existing workspace
    const workspace = await findWorkspace(name);

    // If found, return its ID
    if (workspace) {
      return workspace.id;
    }

    // Otherwise, create a new workspace
    console.log(`Creating new workspace: "${name}"...`);
    const newWorkspace = await createWorkspace(name, description);
    return newWorkspace.id;
  } catch (error) {
    console.error(`Failed to get or create workspace: ${error}`);
    console.log("Using default workspace instead");
    return ""; // Return empty string to use default workspace
  }
}

export { getWorkspaces, findWorkspace, createWorkspace, getOrCreateWorkspace, Workspace };
