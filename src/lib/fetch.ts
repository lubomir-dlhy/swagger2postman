import axios, { AxiosRequestConfig } from "axios";

function fetch(options: AxiosRequestConfig): Promise<any> {
  return new Promise((resolve, reject) => {
    const instance = axios.create({
      baseURL: "https://api.getpostman.com",
      timeout: 180000,
      headers: { "X-Api-Key": process.env.POSTMAN_API_KEY },
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
    });
    instance(options)
      .then((response) => {
        resolve(response);
      })
      .catch((error) => {
        if (error.response) {
          reject(error.response.data.error.message);
        } else {
          reject(error.message);
        }
      });
  });
}

export default fetch;
