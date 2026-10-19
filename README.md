# TrustFlow

**A secure file-sharing and collaboration platform with shared rooms, guest access, and activity auditing.**

[Live Demo](https://trust-flow-lyart.vercel.app/) · [GitHub Repository](https://github.com/Nitesh-Rajput-2005/TrustFlow)

## Overview

TrustFlow is a web application designed to make file sharing and collaboration easier through shared rooms. Users can manage rooms, share access with guests, and work with files through a centralized interface.

The backend includes an audit-event system to track application activity.

## Features

- **User Authentication** — Account registration and login.
- **Shared Rooms** — Create and manage collaboration rooms.
- **Guest Access** — Allow guests to access shared rooms through a guest-access flow.
- **File Management** — Upload and manage files within the application.
- **Activity Auditing** — Record application events through an audit system.
- **Cloud Deployment** — Frontend hosted on Vercel and backend hosted on Render.

## Tech Stack

**Frontend**
- React
- Vite
- JavaScript
- CSS

**Backend**
- Node.js
- Express
- MongoDB with Mongoose
- JWT-based authentication
- Cloudinary integration

## Project Structure

```text
TrustFlow/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   ├── controllers/
│   │   ├── middleware/
│   │   ├── models/
│   │   ├── routes/
│   │   └── utils/
│   ├── package.json
│   └── package-lock.json
├── frontend/
│   ├── public/
│   ├── src/
│   ├── package.json
│   └── package-lock.json
└── .gitignore
```

## Running Locally

### Prerequisites

- Node.js and npm
- A MongoDB connection
- Required environment variables for backend services

### 1. Clone the repository

```bash
git clone https://github.com/Nitesh-Rajput-2005/TrustFlow.git
cd TrustFlow
```

### 2. Start the backend

```bash
cd backend
npm install
npm start
```

Configure the backend environment variables in `backend/.env` before starting the server.

### 3. Start the frontend

Open another terminal:

```bash
cd frontend
npm install
npm run dev
```

Configure the frontend API URL for your local backend when developing locally.

## Deployment

- **Frontend:** https://trust-flow-lyart.vercel.app/
- **Backend:** https://trustflow-aprx.onrender.com

## Future Improvements

- Further improve room and file-access controls.
- Expand audit-event visibility and reporting.
- Improve user experience and error handling.

## Author

**Nitesh Kumar**

GitHub: [Nitesh-Rajput-2005](https://github.com/Nitesh-Rajput-2005)
