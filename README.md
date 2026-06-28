# MSC Trust - Inventory Management System

A comprehensive, full-stack inventory management system designed for MSC Trust. This application provides robust tracking of organizational assets, stock movements, inter-branch distributions, and automated reporting.

## 🚀 Tech Stack
- **Frontend:** Vanilla JavaScript, HTML5, CSS3 (No build step required)
- **Backend:** Node.js, Express.js
- **Database:** SQLite3 (via `better-sqlite3`)
- **Data Visualization:** ECharts
- **Icons:** Lucide Icons

## 📁 Architecture Overview
```text
msc-inventory-management-system/
├── backend/
│   ├── config/            # Database connection configuration (db.js)
│   ├── middlewares/       # Authentication (JWT) and file upload interceptors
│   ├── routes/            # Core API endpoints (inventory, movements, reports)
│   ├── server.js          # Express app entry point
│   ├── package.json       # Node dependencies
│   └── .env.example       # Environment variables template
├── frontend/              # Served statically by the backend
│   ├── index.html         # Single Page Application entry
│   ├── app.js             # Core UI state and logic
│   ├── charts.js          # Dashboard analytics
│   ├── styles.css         # Custom UI system
│   └── img/               # Static assets
├── database/              # SQLite database storage
│   └── schema.sql         # Base database schema for new installations
└── uploads/               # Ignored directory for user-uploaded documents/images
```

## ⚙️ Local Setup Instructions

### Prerequisites
- [Node.js](https://nodejs.org/) (v16 or higher recommended)
- Git

### 1. Clone the Repository
```bash
git clone https://github.com/LanibanCOD02/msc-inventory-management-system.git
cd msc-inventory-management-system/backend
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the example environment file and configure your keys:
```bash
cp .env.example .env
```
Open `.env` and set a strong, random `JWT_SECRET`. 
*(Note: You can generate a strong key by running `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` in your terminal).*

### 4. Initialize the Database (CRITICAL)
Before starting the server for the first time, you **must** initialize the SQLite database schema:
```bash
npm run init-db
```
*(This uses a cross-platform Node script that will automatically generate the database file correctly, without needing the `sqlite3` CLI installed).*

### 5. Start the Server
```bash
npm start
```
The application will now be running at [http://localhost:3000](http://localhost:3000).

## 🔒 First-Time Setup & Authentication
On the very first launch, if the database has no registered users, the application will automatically display a **First-Time Setup** screen instead of the standard login screen. 

1. Use this Setup screen to create the initial Admin account by providing a username and a secure password.
2. Once this first Admin account is successfully created, the Setup screen is permanently disabled.
3. All future visits will show the standard Login screen.
4. Additional users (both Staff and other Admins) can only be created by an Admin through the in-app **Administration -> Users** page. There is no public registration form.
