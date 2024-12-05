# Use an official Node.js runtime as the base image
FROM node:18-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json to the working directory
COPY package*.json ./

# Install project dependencies
RUN npm install

# Copy the rest of the application code
COPY . .

# Expose the port (optional, useful if your bot has a web server)
EXPOSE 3000

# Set environment variables (optional, override with docker-compose or --env-file)
ENV NODE_ENV=production

# Command to run the bot
CMD ["npm", "start"]
