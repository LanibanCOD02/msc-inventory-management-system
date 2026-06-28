# Deployment & Startup Guide

This guide explains how to start the MS Chellamuthu Trust Inventory Server using the automated startup script, and how to set it up so it runs automatically when the computer turns on.

## How to Manually Start the Server

1. Open the **backend** folder in your project directory.
2. Double-click the **`start-server.bat`** file.
3. You might see a black command prompt window flash quickly—this is normal! The server is now running silently in the background.

## Understanding the Log File

When the server runs using the script, it saves all its internal information and any errors into a file called **`server-log.txt`** (located in the same **backend** folder).

- **What it's for:** If the server ever crashes or you can't log in, you can open `server-log.txt` to see exactly what went wrong.
- **Where it is:** It is located directly beside the `start-server.bat` file in the `backend` folder.
- **Does it delete old data?** No, the script keeps a running history. Every time the server starts, it simply adds new information to the bottom of the log file, so you will never lose past error messages.

## Setting Up Automatic Startup (Windows Task Scheduler)

To make this server truly "hands-off," it needs to start automatically every time the computer is turned on or rebooted. 

To achieve this, the `start-server.bat` script must be manually registered in the **Windows Task Scheduler** on the physical machine running the server.

**Note:** This registration must be done *manually* by an administrator on the PC. 

**Steps for the Administrator:**
1. Open the Windows Start Menu, type **Task Scheduler**, and press Enter.
2. Click **Create Basic Task** on the right panel.
3. Name it "MSC Trust Inventory Server" and click Next.
4. Set the trigger to **"When the computer starts"** and click Next.
5. Select **"Start a program"** and click Next.
6. Browse and select the exact file path to `start-server.bat`. 
   *(See the exact path provided to you when this file was generated).*
7. Finish the setup. The server will now start completely on its own every time the computer boots up!
