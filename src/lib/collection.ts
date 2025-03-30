import fetch from "./fetch";

interface CollectionData {
  collection: {
    info: {
      name: string;
      [key: string]: any;
    };
    item: any[];
    [key: string]: any;
  };
  [key: string]: any;
}

function updateCollection(uid: string, data: CollectionData): void {
  fetch({
    url: "/collections/" + uid,
    method: "PUT",
    data,
  })
    .then(() => {
      console.log("Collection has been successfully updated");
    })
    .catch((err) => {
      console.error("Collection update has failed:" + err);
    });
}

function getCollectionId(name: string, workspaceId?: string): Promise<string | null> {
  const url = workspaceId ? `/collections?workspace=${workspaceId}` : "/collections";

  return fetch({
    url,
    method: "get",
  })
    .then((response) => {
      let collection = response.data.collections.find((ele: any) => ele.name === name);
      if (collection == null) {
        console.log("No collection with name: " + name);
        return null;
      }
      console.log("Collection uid is: " + collection.uid);
      return collection.uid;
    })
    .catch((err) => {
      console.error("Get collection error: " + err);
      process.exit(-1);
    });
}

function createCollection(name: string, description?: string, workspaceId?: string): Promise<string> {
  const data = {
    collection: {
      info: {
        name,
        description: description || `${name} API`,
        schema: "https://schema.getpostman.com/json/collection/v2.1.0/collection.json",
      },
      item: [],
    },
  };

  let url = workspaceId ? `/collections?workspace=${workspaceId}` : "/collections";

  return fetch({
    url,
    method: "post",
    data,
  })
    .then((response) => {
      console.log("Collection created with uid: " + response.data.collection.uid);
      return response.data.collection.uid;
    })
    .catch(async (err) => {
      // Check if it's a permission error
      if (err.toString().includes("not permitted") && workspaceId) {
        console.warn(`Permission denied when creating collection in workspace ID: ${workspaceId}`);
        console.log("Attempting to create collection in your default workspace instead...");

        // Try again without the workspace parameter (uses "My Workspace")
        return fetch({
          url: "/collections",
          method: "post",
          data,
        })
          .then((response) => {
            console.log("Collection created in default workspace with uid: " + response.data.collection.uid);
            return response.data.collection.uid;
          })
          .catch((fallbackErr) => {
            console.error("Failed to create collection in default workspace: " + fallbackErr);
            console.error("Please check your API key permissions or contact your workspace administrator.");
            process.exit(-1);
          });
      } else {
        console.error("Create collection failed: " + err);
        console.error("Please verify your API key has the required permissions to create collections.");
        process.exit(-1);
      }
    });
}

function getCollectionDetail(uid: string): Promise<CollectionData> {
  return fetch({
    url: "/collections/" + uid,
    method: "get",
  })
    .then((response) => {
      return response.data;
    })
    .catch((err) => {
      console.error("get collection detail failed: " + err);
      process.exit(-1);
    });
}

export { updateCollection, getCollectionId, getCollectionDetail, createCollection, CollectionData };
