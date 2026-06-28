# MS Chellamuthu Trust - Inventory Management System
## Official Testing & Handover Guide

Welcome to the testing phase of the new MS Chellamuthu Trust Inventory Management System. This guide will walk you through setting up the system for the first time and testing all core functionalities.

---

### 1. Installation & Initial Setup
1. **Clone the Repository:** Download the software to the target PC.
2. **Install Dependencies:** Open a terminal in the `backend` folder and run `npm install`.
3. **Configure Environment:** 
   - Duplicate the `.env.example` file in the root directory and rename the copy to `.env`.
   - Open `.env` and set a random password string for `JWT_SECRET`.
4. **Initialize the Database:** In the `backend` terminal, run `npm run init-db`.
5. **Start the Server:** In the `backend` terminal, run `npm start`.

---

### 2. First-Time Setup (Admin Account)
1. Open your web browser and navigate to **http://localhost:3000**.
2. Because the database is fresh, you will automatically be greeted by the **First-Time Setup** screen.
3. Enter your desired Admin email (e.g., `admin@msctrust.org`) and a secure password.
4. Click **Create Admin Account**. 
5. The setup screen will permanently disable itself, and you will be redirected to the Login Screen.

---

### 3. Core Module Testing

#### A. Administration (Users & Master Data)
- Log in using your new Admin credentials.
- Navigate to the **Administration** panel using the left sidebar.
- **Master Data:** Add a few sample Branches, Programs, Categories, and Suppliers.
- **User Management:** Create a 'Staff' account for testing. Note that Staff accounts have restricted permissions (e.g., they cannot approve deletion requests or create other users).

#### B. Inventory Management
- Navigate to **Inventory** in the sidebar.
- Click **Add Item** to create a new inventory item.
- Upload a product photo, set a reorder threshold, and assign it to a specific branch and category.
- Verify that the item appears in the main Inventory table.

#### C. Stock Movements (In/Out)
- Click on the newly created item to view its details.
- Click **Record Movement**.
- **Stock In:** Add stock to the item. Upload a sample Bill/Invoice image.
- **Stock Out:** Remove stock from the item (simulating consumption or dispatch).
- Verify that the total stock count updates accurately in real-time.

#### D. Deletion Requests (Approval Workflow)
- Log out of the Admin account and **log in as the Staff user**.
- Attempt to delete an inventory item. You will be prompted to submit a **Deletion Request** with a reason.
- Log out and **log back in as the Admin**.
- Check the **Dashboard** or Notifications for pending deletion requests.
- Review and Approve the request. Verify that the item is successfully marked as deleted.

---

### 4. Dashboard & Reporting
- Navigate to the **Dashboard** to view real-time statistics (Low Stock Alerts, Total Items, Recent Movements).
- Navigate to the **Reports** section to generate customized stock reports.
- Use the filters to sort by Branch, Category, or Date Range, and verify that the Export to CSV/PDF functions correctly capture the displayed data.

---
*Thank you for testing! Please log any bugs or feedback encountered during these steps.*
