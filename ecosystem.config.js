module.exports = {
  apps: [
    {
      name: "my-app",
      script: "./dist/index.js",
      interpreter: "node",
      interpreter_args: "--enable-source-maps",
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};
