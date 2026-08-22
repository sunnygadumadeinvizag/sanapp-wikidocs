import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import type { PageVisibility } from "../src/generated/prisma/enums";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
const prisma = new PrismaClient({ adapter });

async function main() {
  // ---- App users (provisional; real identity comes from SSO on login) ----
  const admin = await prisma.appUser.upsert({
    where: { username: "admin" },
    update: { role: "ADMIN", name: "System Administrator" },
    create: {
      ssoUserId: "seed-admin",
      username: "admin",
      name: "System Administrator",
      email: "admin@iipe.ac.in",
      primaryRole: "STAFF_NON_TEACHING",
      role: "ADMIN",
    },
  });
  const sanyasi = await prisma.appUser.upsert({
    where: { username: "sanyasi" },
    update: { role: "EDITOR" },
    create: {
      ssoUserId: "seed-sanyasi",
      username: "sanyasi",
      name: "Sanyasi Naidu Paila",
      email: "sanyasinaidup.it@iipe.ac.in",
      primaryRole: "STAFF_NON_TEACHING",
      role: "EDITOR",
    },
  });

  // ---- Default publish policy: staff may publish; plus named users ----
  const policy = await prisma.publishPolicy.findFirst();
  if (!policy) {
    await prisma.publishPolicy.create({
      data: {
        id: "default-policy",
        allowedRoles: ["STAFF_TEACHING", "STAFF_NON_TEACHING"],
        allowedUsers: ["sanyasi", "admin"],
        updatedById: admin.id,
      },
    });
  }

  async function section(args: {
    parentId: string | null;
    slug: string;
    name: string;
    description: string;
    sortOrder: number;
  }) {
    const existing = await prisma.wikiSection.findFirst({
      where: { slug: args.slug, parentId: args.parentId },
    });
    if (existing) {
      return prisma.wikiSection.update({
        where: { id: existing.id },
        data: { name: args.name, description: args.description, sortOrder: args.sortOrder },
      });
    }
    return prisma.wikiSection.create({
      data: { ...args, createdById: admin.id },
    });
  }

  // ==========================================
  // SECTION TREE
  // ==========================================
  const itNetwork = await section({ parentId: null, slug: "itnetwork", name: "IT Network & Infrastructure", description: "Campus network, Wi-Fi, VPN and network services", sortOrder: 10 });
  const vpn = await section({ parentId: itNetwork.id, slug: "vpn", name: "VPN & Remote Access", description: "Remote access to intranet and campus clusters", sortOrder: 10 });
  const wifi = await section({ parentId: itNetwork.id, slug: "wifi", name: "Wi-Fi & Eduroam", description: "Connecting to campus wireless networks", sortOrder: 20 });
  const printing = await section({ parentId: itNetwork.id, slug: "printing", name: "Network Printing", description: "Network printers and scanning configuration", sortOrder: 30 });

  const itSoftware = await section({ parentId: null, slug: "itsoftware", name: "Software & Development", description: "Software installation, development tools, and licenses", sortOrder: 20 });
  
  const logRequestGuide = await section({ parentId: null, slug: "logrequest-guide", name: "Log Request & Helpdesk", description: "How to raise and track service requests across departments", sortOrder: 30 });

  const wikiDocsGuide = await section({ parentId: null, slug: "wikidocs-guide", name: "Wiki Docs Guide", description: "How to create, format, publish, and manage wiki pages", sortOrder: 40 });

  const facilitiesSection = await section({ parentId: null, slug: "facilities", name: "Facilities Booking", description: "Facilities, halls, rooms booking rules and policies", sortOrder: 50 });

  const general = await section({ parentId: null, slug: "general", name: "General & Campus Life", description: "Campus guidelines, hostel policies, and institute rules", sortOrder: 60 });
  const hostel = await section({ parentId: general.id, slug: "hostel", name: "Hostel Guidelines", description: "Hostel facilities, mess and rules", sortOrder: 10 });

  // ==========================================
  // PAGE HELPER (Upsert + Versioning)
  // ==========================================
  async function page(args: {
    sectionId: string;
    title: string;
    slug: string;
    visibility: PageVisibility;
    content: string;
    allowedRoles?: string[];
    author: typeof admin;
  }) {
    let p = await prisma.wikiPage.findUnique({
      where: { sectionId_slug: { sectionId: args.sectionId, slug: args.slug } },
      include: { versions: { orderBy: { version: "desc" }, take: 1 } },
    });

    if (!p) {
      p = await prisma.wikiPage.create({
        data: {
          sectionId: args.sectionId,
          title: args.title,
          slug: args.slug,
          visibility: args.visibility,
          allowedRoles: args.allowedRoles ?? [],
          status: "PUBLISHED",
          publishedAt: new Date(),
          publishedById: args.author.id,
          createdById: args.author.id,
        },
        include: { versions: true },
      });
      const v = await prisma.wikiPageVersion.create({
        data: {
          pageId: p.id,
          version: 1,
          title: args.title,
          content: args.content,
          changeSummary: "Initial documentation release",
          authorId: args.author.id,
          isPublished: true,
          publishedAt: p.publishedAt,
        },
      });
      await prisma.wikiPage.update({
        where: { id: p.id },
        data: { currentVersionId: v.id },
      });
    } else {
      const nextVer = (p.versions[0]?.version ?? 0) + 1;
      const v = await prisma.wikiPageVersion.create({
        data: {
          pageId: p.id,
          version: nextVer,
          title: args.title,
          content: args.content,
          changeSummary: "Updated documentation content",
          authorId: args.author.id,
          isPublished: true,
          publishedAt: new Date(),
        },
      });
      await prisma.wikiPage.update({
        where: { id: p.id },
        data: {
          title: args.title,
          visibility: args.visibility,
          allowedRoles: args.allowedRoles ?? [],
          currentVersionId: v.id,
          publishedAt: new Date(),
          publishedById: args.author.id,
        },
      });
    }
    return p;
  }

  // ==========================================
  // 1. IT SOFTWARE & DEVELOPMENT ENVIRONMENT
  // ==========================================
  await page({
    sectionId: itSoftware.id,
    title: "Development Tools & Environment Setup",
    slug: "dev-tools-setup",
    visibility: "PUBLIC",
    author: sanyasi,
    content: `# Development Tools & Environment Setup

This guide provides recommended setups for programming languages, editors, compilers, and database tools for IIPE students, researchers, and faculty.

---

## 1. Visual Studio Code (Recommended IDE)

Visual Studio Code is the standard code editor recommended across IIPE computer science and engineering coursework.

### Installation
- **Windows / macOS**: Download installer from [code.visualstudio.com](https://code.visualstudio.com/).
- **Ubuntu / Linux**:
  \`\`\`bash
  sudo snap install --classic code
  # or via apt
  sudo apt update && sudo apt install software-properties-common apt-transport-https wget
  wget -q https://packages.microsoft.com/keys/microsoft.asc -O- | sudo apt-key add -
  sudo add-apt-repository "deb [arch=amd64] https://packages.microsoft.com/repos/vscode stable main"
  sudo apt install code
  \`\`\`

### Recommended Extensions
- **Python**: \`ms-python.python\` (Python language support, IntelliSense, Linting)
- **C/C++**: \`ms-vscode.cpptools\` (IntelliSense, debugging with GDB/LLDB)
- **Prettier**: \`esbenp.prettier-vscode\` (Code formatter)
- **GitLens**: \`eamodio.gitlens\` (Git repository history and commit blame)
- **Remote - SSH**: \`ms-vscode-remote.remote-ssh\` (Direct editing on campus cluster servers)

---

## 2. Python & Data Science Environment

We recommend **Python 3.11+** along with **Miniconda** or **Virtual Environments**.

\`\`\`bash
# Create a virtual environment
python -m venv myenv

# Activate on Linux/macOS
source myenv/bin/activate

# Activate on Windows (PowerShell)
.\\myenv\\Scripts\\Activate.ps1

# Install common scientific packages
pip install numpy scipy pandas matplotlib jupyterlab scikit-learn
\`\`\`

### Launching JupyterLab
\`\`\`bash
jupyter lab --no-browser --port 8888
\`\`\`

---

## 3. Git & GitHub / GitLab Setup

All course assignments and lab submissions require Git version control.

### Configure Git Identity
\`\`\`bash
git config --global user.name "Your Full Name"
git config --global user.email "yourusername@iipe.ac.in"
git config --global init.defaultBranch main
\`\`\`

### Generate SSH Key for Secure Code Push
\`\`\`bash
ssh-keygen -t ed25519 -C "yourusername@iipe.ac.in"
# Press Enter to accept default location (~/.ssh/id_ed25519)
cat ~/.ssh/id_ed25519.pub
\`\`\`
Copy the public key and paste into your GitHub/GitLab profile settings under **SSH and GPG keys**.

---

## 4. C / C++ Toolchain & Compilers

- **Windows**: Install [MSYS2](https://www.msys2.org/) or Visual Studio Community with C++ build tools.
  \`\`\`bash
  # Inside MSYS2 terminal:
  pacman -S mingw-w64-ucrt-x86_64-gcc mingw-w64-ucrt-x86_64-gdb
  \`\`\`
- **Linux (Ubuntu/Debian)**:
  \`\`\`bash
  sudo apt update
  sudo apt install build-essential gdb cmake valgrind
  \`\`\`

---

## 5. PostgreSQL & Database Tools

To connect to course databases or local development instances:
- Install **pgAdmin 4** or **DBeaver Community Edition**.
- CLI Client: \`sudo apt install postgresql-client\` (or \`psql\` on Windows).

> For specialized software licenses or lab machine configurations, contact IT Services via **Log Request**.`,
  });

  await page({
    sectionId: itSoftware.id,
    title: "IIPE Email & Microsoft 365 Configuration",
    slug: "email-and-office365-setup",
    visibility: "PUBLIC",
    author: admin,
    content: `# IIPE Email & Microsoft 365 Configuration

All active faculty, staff, research scholars, and students are provisioned an official **@iipe.ac.in** Microsoft 365 account.

---

## 1. Web Access
- **Webmail / Outlook**: [outlook.office.com](https://outlook.office.com/)
- **Microsoft 365 Portal**: [portal.office.com](https://portal.office.com/)
- Sign in with your full institute email (\`username@iipe.ac.in\`) and password.

---

## 2. Setting Up Outlook on Desktop (Windows / macOS)

1. Open **Microsoft Outlook**.
2. When prompted for email address, enter \`yourusername@iipe.ac.in\`.
3. Click **Connect**.
4. The Microsoft Sign-In dialog will appear. Enter your institute credentials.
5. Complete Multi-Factor Authentication (MFA / Microsoft Authenticator app) if enabled.
6. Once configured, your Mail, Institute Calendar, and Contacts will synchronize automatically.

---

## 3. Setting Up Email on Mobile (Android / iOS)

We strongly recommend the official **Microsoft Outlook Mobile App**:
1. Install **Microsoft Outlook** from Google Play Store or Apple App Store.
2. Tap **Add Account** → Enter \`yourusername@iipe.ac.in\`.
3. Sign in via the secure institute web portal.
4. Approve the prompt on your Authenticator app.

---

## 4. Manual IMAP / SMTP Settings (For Thunderbird & Other Clients)

If using third-party email clients like Mozilla Thunderbird:

| Parameter | Incoming Server (IMAP) | Outgoing Server (SMTP) |
| :--- | :--- | :--- |
| **Server Name** | \`outlook.office365.com\` | \`smtp.office365.com\` |
| **Port** | \`993\` | \`587\` |
| **Encryption** | \`TLS / SSL\` | \`STARTTLS\` |
| **Authentication** | \`OAuth2\` (Modern Auth) | \`OAuth2\` (Modern Auth) |
| **Username** | \`yourusername@iipe.ac.in\` | \`yourusername@iipe.ac.in\` |

---

## 5. OneDrive Cloud Storage (1 TB Storage)

Every institute member has 1 TB of secure cloud storage on OneDrive:
- **Automatic Sync**: Download the OneDrive app to back up research papers, code repositories, and documents.
- **Sharing**: Share large datasets and course materials directly with collaborators via link permissions.

> Need a password reset? Use the **Forgot Password** feature on the [SSO Portal](/sso/forgot-password) or raise a ticket in **Log Request**.`,
  });

  await page({
    sectionId: itSoftware.id,
    title: "Engineering Software: MATLAB & Aspen Plus",
    slug: "engineering-software-licensing",
    visibility: "AUTHENTICATED",
    author: admin,
    content: `# Engineering Software: MATLAB & Aspen Plus

IIPE maintains network and campus-wide floating licenses for specialized petroleum, chemical, and computational engineering tools.

---

## 1. MATLAB Campus License

IIPE has an institutional MATLAB Campus-Wide License.

### Installation Steps
1. Visit [mathworks.com/login](https://www.mathworks.com/login).
2. Create or sign in to your MathWorks account using your **@iipe.ac.in** email address.
3. Your account will automatically associate with the **IIPE Campus License**.
4. Download the MATLAB Installer for your operating system.
5. Select desired toolboxes (Simulink, Optimization, Deep Learning, Statistics, Partial Differential Equations).
6. Log in with your IIPE email inside the installer to activate.

---

## 2. Aspen Plus & Chemical Process Simulation

Aspen Plus licenses are floating network licenses hosted on the institute license server.

- **License Server IP**: \`10.10.2.15\`
- **Port**: \`27000\`
- **Access Location**: Accessible from all Department Computer Labs and via campus VPN.

---

## 3. High Performance Computing (HPC) Access

For compute-intensive simulations (CFD, Molecular Dynamics, Machine Learning):
- Connect via SSH: \`ssh yourusername@hpc.iipe.ac.in\`
- Slurm job scheduler is used for batch execution.
- Detailed HPC user manuals and job script templates are available under the academic research repository.`,
  });

  // ==========================================
  // 2. IT NETWORK, WI-FI & PRINTING
  // ==========================================
  await page({
    sectionId: vpn.id,
    title: "How to set up VPN",
    slug: "how-to-setup-vpn",
    visibility: "PUBLIC",
    author: sanyasi,
    content: `# How to Set Up Campus VPN

IIPE provides secure Virtual Private Network (VPN) access allowing faculty, scholars, and staff to connect to institute internal resources, journal subscriptions, and servers from off-campus.

---

## VPN Server Information

- **Primary Gateway**: \`vpn.iipe.ac.in\`
- **Supported Protocols**: OpenVPN, WireGuard, SSL VPN
- **Authentication**: IIPE Central Single Sign-On credentials

---

## 1. Windows Setup (OpenVPN Connect)

1. Download and install **OpenVPN Connect Client (v3+)** from the official OpenVPN site.
2. Download the IIPE VPN configuration profile (\`iipe-vpn.ovpn\`) from the IT Portal.
3. Open OpenVPN Connect → Click **File** → Import \`iipe-vpn.ovpn\`.
4. Enter your IIPE Username and Password.
5. Toggle the connection switch to **Connected**.

---

## 2. Linux (Ubuntu / Debian / Fedora) Setup

\`\`\`bash
# Install OpenVPN network manager plugin
sudo apt update && sudo apt install network-manager-openvpn-gnome openvpn

# Connect via CLI
sudo openvpn --config iipe-vpn.ovpn --auth-user-pass

# Or import in GNOME Network Settings:
# Settings -> Network -> VPN -> Import from file -> Select iipe-vpn.ovpn
\`\`\`

---

## 3. macOS Setup (Tunnelblick / OpenVPN)

1. Download and install **Tunnelblick** (free, open source) or **OpenVPN Connect for macOS**.
2. Double-click the \`iipe-vpn.ovpn\` profile to install for all users.
3. Click Connect in the menu bar and enter your credentials.

---

## What Can You Access Over VPN?
- IEEE Xplore, ScienceDirect, Springer, and ACS library journals
- Campus intranet applications (\`https://intranet.iipe.ac.in\`)
- HPC Cluster and laboratory computing clusters (\`10.10.x.x\`)
- Institute database and internal development environments

> Facing connection drops? Check the [VPN Troubleshooting Guide](/docs/itnetwork/vpn/vpn-troubleshooting).`,
  });

  await page({
    sectionId: wifi.id,
    title: "Connecting to Campus Wi-Fi & Eduroam",
    slug: "connecting-to-iipe-wifi",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# Connecting to Campus Wi-Fi & Eduroam

The IIPE campus network covers academic blocks, laboratories, library, administrative offices, and student hostels with high-speed 802.11ac/ax Wi-Fi.

---

## Available SSIDs

1. **IIPE-WiFi** (Primary campus network for staff and students)
2. **eduroam** (Worldwide roaming access service for researchers and staff)
3. **IIPE-Guest** (Restricted temporary access for visitors and conference attendees)

---

## 1. Connecting to IIPE-WiFi (802.1X Enterprise)

- **SSID**: \`IIPE-WiFi\`
- **EAP Method**: \`PEAP\`
- **Phase 2 Authentication**: \`MSCHAPv2\`
- **CA Certificate**: \`Use system certificates\` (or \`Do not validate\` for older devices)
- **Identity / Username**: Your IIPE username (e.g. \`sanyasi\` or \`21che001\`)
- **Password**: Your IIPE password

---

## 2. Connecting to Eduroam

When visiting other universities (IITs, IISc, NITs, and international universities):
- **SSID**: \`eduroam\`
- **Username**: Must include domain: \`yourusername@iipe.ac.in\`
- **Password**: Your standard IIPE password
- You will be connected automatically anywhere in the world where Eduroam is supported.

---

## 3. Common Troubleshooting Steps

| Issue | Solution |
| :--- | :--- |
| **Authentication failed** | Ensure username does not contain extra spaces; verify password on SSO |
| **Captive portal not loading** | Open browser and navigate to \`http://1.1.1.1\` or \`http://neverssl.com\` |
| **Frequent disconnections** | Turn off "Randomized MAC address" in Wi-Fi settings for IIPE-WiFi |
| **IP address conflict** | Toggle Airplane Mode or renew DHCP lease |

> For MAC binding or device registration, raise a ticket under **IT Network → Wi-Fi** in [Log Request](/logrequest).`,
  });

  await page({
    sectionId: printing.id,
    title: "Setting Up Network Printers & Scanners",
    slug: "network-printer-setup",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# Setting Up Network Printers & Scanners

High-capacity multi-function network printers and scanners are deployed across academic departments, faculty lounges, and the central library.

---

## Printer Locations & IP Addresses

| Department / Location | Printer Model | Network IP | Features |
| :--- | :--- | :--- | :--- |
| **Academic Block - 2nd Floor** | Canon imageRUNNER 2630i | \`10.10.4.21\` | A4/A3, Duplex, Color Scan |
| **Faculty Block - 1st Floor** | HP LaserJet Enterprise M608 | \`10.10.4.22\` | B&W Fast Print, Duplex |
| **Central Library** | Canon imageRUNNER ADV 4525 | \`10.10.4.25\` | Print, Scan to Email |
| **Admin Block - Board Room** | HP Color LaserJet MFP M479 | \`10.10.4.28\` | Full Color, Secure Print |

---

## 1. Adding a Network Printer on Windows

1. Connect to **IIPE-WiFi** or wired LAN.
2. Open **Settings → Bluetooth & devices → Printers & scanners**.
3. Click **Add device** → Click **"The printer that I want isn't listed"**.
4. Choose **"Add a printer using an IP address or hostname"**.
5. Device type: **TCP/IP Device**.
6. Hostname or IP address: Enter the IP from table above (e.g. \`10.10.4.21\`).
7. Select **Generic PCL6 Driver** or install manufacturer driver from the IT shared repository.
8. Set as default printer.

---

## 2. Adding a Network Printer on macOS / Linux

- **macOS**: System Settings → Printers & Scanners → Add Printer → IP Tab → Protocol: **Line Printer Daemon (LPD)** or **HP Jetdirect** → Enter IP.
- **Linux (CUPS)**: Open \`http://localhost:631\` in browser or use system printing dialog → AppSocket/HP JetDirect → \`socket://10.10.4.21:9100\`.

---

## 3. Paper Quotas & Printing Policy

- Faculty & Staff: Unlimited for academic/administrative duties.
- Research Scholars & Students: 100 pages per semester allotted per student. Additional quota can be requested through departmental head.
- Always use **Duplex (Two-Sided) Printing** to save paper and reduce institute carbon footprint.`,
  });

  // ==========================================
  // 3. LOG REQUEST USER & POC GUIDE
  // ==========================================
  await page({
    sectionId: logRequestGuide.id,
    title: "How to Raise & Track a Service Request",
    slug: "how-to-raise-service-request",
    visibility: "PUBLIC",
    author: sanyasi,
    content: `# How to Raise & Track a Service Request (Log Request)

The **Log Request** portal (\`/logrequest\`) is the centralized helpdesk ticketing platform for IIPE. It allows staff, faculty, and students to report issues, request assistance, and track work progress with complete transparency.

---

## 1. Service Categories & Departments

When creating a request, choose the appropriate category so it is immediately assigned to the right Point of Contact (POC):

1. **IT Services & Infrastructure**: Network/Wi-Fi, Computer Hardware, Software, SSO/Account, Email, Projectors.
2. **Electrical Maintenance**: Power supply, lights, fans, UPS backup, air conditioning (HVAC).
3. **Civil & Estate Maintenance**: Furniture repairs, plumbing, carpentry, door/window fixtures.
4. **Campus Support & Housekeeping**: Waste management, cleaning, hostel facilities.

---

## 2. Step-by-Step: Raising a Ticket

1. Open **Log Request** from the intranet launcher (\`https://intranet.iipe.ac.in/logrequest\`).
2. Click **+ New Request** in the sidebar.
3. Fill in the request details:
   - **Section / Department**: e.g., *IT Services* or *Electrical*.
   - **Category**: Specific subcategory (e.g., *Wi-Fi Connectivity* or *Printer Setup*).
   - **Location**: Building, Floor, and Room number (critical for on-site technician visits).
   - **Subject**: A clear, 1-line summary of the issue.
   - **Description**: Detailed description of what happened, error codes, and steps to reproduce.
   - **Priority**: *Low*, *Normal*, *High*, or *Urgent* (reserve Urgent for critical outages affecting classes/events).
   - **Attachments**: Upload photos, diagnostic screenshots, or PDF files (up to 5 MB).
4. Click **Submit Request**.

---

## 3. Tracking Your Ticket Lifecycle

Every ticket progresses through defined statuses:

\`\`\`mermaid
graph LR
    A[RAISED] --> B[ASSIGNED]
    B --> C[WORK IN PROGRESS]
    C --> D[RESOLVED]
    D --> E[CLOSED]
\`\`\`

- **RAISED**: Ticket submitted, pending POC review.
- **ASSIGNED**: Section POC has assigned a specialized technician or engineer.
- **IN PROGRESS**: Work is underway (parts ordered, technician on site).
- **RESOLVED**: Work completed by technician; awaiting user verification.
- **CLOSED**: Issue resolved and confirmed.

---

## 4. Two-Way Discussion with POCs

- Open your ticket anytime from **My Requests**.
- Use the **Comments** thread to ask questions, provide extra details, or upload additional photos.
- You will receive instant notifications in your intranet bell icon when a POC replies.

---

## 5. Escalation & Service Level Agreements (SLA)

| Priority | First Response SLA | Resolution SLA |
| :--- | :--- | :--- |
| **Urgent** | < 1 Hour | 4 - 8 Hours |
| **High** | < 4 Hours | 24 Hours |
| **Normal** | < 12 Hours | 2 - 3 Working Days |
| **Low** | < 24 Hours | 5 Working Days |

> If a ticket is unresolved past the SLA deadline, it is automatically escalated to the Section In-Charge.`,
  });

  await page({
    sectionId: logRequestGuide.id,
    title: "POC & Staff Maintenance Workflow Guide",
    slug: "poc-and-staff-guide",
    visibility: "RESTRICTED",
    allowedRoles: ["STAFF_TEACHING", "STAFF_NON_TEACHING"],
    author: admin,
    content: `# POC & Staff Maintenance Workflow Guide

This guide is for Department Points of Contact (POCs), System Engineers, and Maintenance Technicians responsible for resolving institute tickets.

---

## 1. Accessing the Work Queue

1. Navigate to **Log Request → Queue** or **My Work**.
2. Filter tickets by Department, Status (*Assigned*, *In Progress*), or Priority.

---

## 2. Managing Ticket Assignments
- **Claiming**: Assign unallocated tickets to yourself or a team member.
- **Adding Work Notes**: Record diagnostic findings, spare parts requested, or vendor reference numbers in internal work logs.
- **Status Updates**: Update status from *Assigned* to *Work in Progress* as soon as investigation begins.

---

## 3. Resolving Tickets
1. Ensure all physical repairs or software configurations are tested and verified.
2. In the ticket resolution modal, summarize the action taken (e.g., *"Replaced network patch cable in Room 302; verified 1000 Mbps link"*).
3. Submit as **Resolved**. The requester is automatically notified to test and close the ticket.`,
  });

  // ==========================================
  // 4. WIKI DOCS PUBLISHING & AUTHORING GUIDE
  // ==========================================
  await page({
    sectionId: wikiDocsGuide.id,
    title: "Creating, Editing & Formatting Wiki Pages",
    slug: "authoring-and-formatting-guide",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# Creating, Editing & Formatting Wiki Pages

Wiki Docs (\`/wikidocs\`) is the central knowledge base of IIPE. It enables departments, academic sections, and student bodies to publish and maintain living documentation.

---

## 1. Who Can Create Pages?

- **App Administrators** (\`ADMIN\` role) can create, edit, manage sections, and modify the institute publishing policy.
- **Designated Editors** (\`EDITOR\` role, or roles permitted under the **Publish Policy** such as Teaching/Non-Teaching Staff) see the **+ New Page** action in the sidebar.
- **Readers** have read access to all public and authenticated documentation.

---

## 2. Step-by-Step: Creating a New Page

1. Click **+ New Page** in the Wiki Docs sidebar navigation.
2. Fill in the page metadata:
   - **Section**: Select the parent folder (e.g. *IT Software*, *Facilities Booking*).
   - **Page Title**: Descriptive, concise title (e.g. *Network Printer Setup*).
   - **URL Slug**: URL-friendly identifier (auto-generated from title, e.g. \`network-printer-setup\`).
   - **Visibility**:
     - \`PUBLIC\`: Readable by everyone, even without logging in.
     - \`AUTHENTICATED\`: Readable by all signed-in IIPE members.
     - \`RESTRICTED\`: Accessible only by specific roles or usernames.
3. Write your document using Markdown in the editor.
4. Click **Publish Page** (or Save as Draft).

---

## 3. Markdown Formatting Cheat Sheet

Wiki Docs uses GitHub Flavored Markdown (GFM) with full syntax support:

### Headings
\`\`\`markdown
# Level 1 Heading
## Level 2 Heading
### Level 3 Heading
\`\`\`

### Tables
\`\`\`markdown
| Feature | Supported | Notes |
| :--- | :---: | :--- |
| Markdown | Yes | CommonMark + GFM |
| LaTeX Math | Yes | Inline $E=mc^2$ and block math |
| Code Blocks | Yes | Syntax highlighted |
\`\`\`

### Callout Boxes & Quotes
\`\`\`markdown
> **Important Note:** Always log out of shared public workstations.
\`\`\`

### Code Blocks with Syntax Highlighting
\`\`\`python
def calculate_flow_rate(pressure, diameter):
    import math
    return math.pi * (diameter / 2) ** 2 * pressure
\`\`\`

---

## 4. Version History & Audit Trail
- Every time a published page is saved, a new immutable version is archived.
- Click **Page History** at the top of any page to view previous revisions, author timestamps, change summaries, and restore earlier content if necessary.`,
  });

  await page({
    sectionId: wikiDocsGuide.id,
    title: "Publishing Policy, Roles & Visibility Rules",
    slug: "publishing-policy-and-roles",
    visibility: "PUBLIC",
    author: admin,
    content: `# Publishing Policy, Roles & Visibility Rules

This document outlines the governance and authorization framework for Wiki Docs.

---

## 1. Three-Tier Role Hierarchy

| Role | Permissions | Who holds this role |
| :--- | :--- | :--- |
| **ADMIN** | Full system control: create/delete sections, modify publish policy, manage users, view system audit trail, publish anywhere. | System Administrator & IT Section Heads |
| **EDITOR** | Create new pages, edit existing pages within permitted sections, upload document attachments. | Faculty, Technical Officers, Authorized Staff |
| **READER** | Read access to all permitted documentation; search knowledge base; download attachments. | Students, Research Scholars, General Public |

---

## 2. Page Visibility Matrix

When authoring a page, editors can specify one of three visibility levels:

\`\`\`mermaid
graph TD
    V[Page Visibility] --> P[PUBLIC]
    V --> A[AUTHENTICATED]
    V --> R[RESTRICTED]
    
    P --> P1[Anonymous Visitors + All Users]
    A --> A1[Signed-in IIPE Users Only]
    R --> R1[Specific Roles: Faculty / Staff / Admins]
\`\`\`

1. **PUBLIC**:
   - Clean, full-width reader layout for anonymous public visitors.
   - Ideal for: Admissions criteria, academic calendars, institute contact lists, hostel general rules.
2. **AUTHENTICATED**:
   - Available to any valid IIPE user who logs in via SSO.
   - Ideal for: Campus Wi-Fi passwords, internal software setup guides, lab schedules.
3. **RESTRICTED**:
   - Only viewable by specified SSO primary roles (e.g. \`STAFF_TEACHING\`) or designated usernames.
   - Ideal for: Administrative guidelines, procurement procedures, confidential committee documents.

---

## 3. Dynamic Publishing Policy

The App Administrator can grant publishing rights dynamically via the **Admin Console** without database migrations:
- Grant publishing privileges to entire roles (e.g. \`STAFF_TEACHING\`, \`SCHOLAR\`).
- Grant individual user overrides (e.g. student club technical leads).`,
  });

  // ==========================================
  // 5. FACILITIES BOOKING RULES & RESTRICTIONS
  // ==========================================
  await page({
    sectionId: facilitiesSection.id,
    title: "Step-by-Step Facilities Booking Guide",
    slug: "facilities-booking-procedure",
    visibility: "PUBLIC",
    author: sanyasi,
    content: `# Step-by-Step Facilities Booking Guide

The **Facilities Booking** app (\`/facilities\`) manages reservations for institute seminar halls, conference rooms, smart classrooms, computing laboratories, and the institute guest house.

---

## 1. Available Facilities

| Facility Name | Capacity | Building / Location | Standard Equipment |
| :--- | :---: | :--- | :--- |
| **Main Auditorium** | 350 | Main Academic Complex | Dual 4K Laser Projectors, Podium Mic, Wireless Mics, Recording System |
| **Seminar Hall 1** | 120 | Academic Block - 1st Floor | HD Projector, Audio System, Video Conferencing, Whiteboard |
| **Seminar Hall 2** | 80 | Academic Block - 2nd Floor | Interactive Smart Display, Lapel Mics, Air Conditioned |
| **Executive Board Room** | 30 | Administrative Complex | Polycom Video Conference, Mic for each seat, 85" Display |
| **Smart Classroom 101 - 105** | 60 each | Academic Block | Smart Podium, Projector, Document Camera |
| **Central Computing Lab** | 75 | Computer Centre | High-end Core i7 workstations, Gigabit Network, Central UPS |
| **Institute Guest House** | 12 Rooms | Guest House Complex | AC Executive Suites, Wi-Fi, Dining Facility |

---

## 2. How to Book a Facility

1. Open **Facilities Booking** from the intranet launcher (\`https://intranet.iipe.ac.in/facilities\`).
2. Select your desired **Building** → Choose the specific **Facility**.
3. View the **Interactive Slot Calendar** to check live availability in Indian Standard Time (IST).
4. Click on an available time slot.
5. Provide booking details:
   - **Event Title / Purpose**: e.g., *"Guest Lecture on Reservoir Simulation"*.
   - **Expected Attendees**: Number of participants.
   - **AV / Technical Support Required**: Projector, microphones, video conference recording.
   - **Sanction Document (PDF)**: Attach official departmental approval or circular (if required for large halls).
6. Click **Confirm Booking**. The slot is instantly reserved and registered in the institute master calendar.

---

## 3. Viewing & Managing Your Bookings
- Access **My Bookings** in the sidebar to review all upcoming and past reservations.
- Download PDF Booking Receipts for administrative verification or security gate entry.`,
  });

  await page({
    sectionId: facilitiesSection.id,
    title: "Booking Rules, Time Restrictions & Cancellation Policy",
    slug: "facilities-rules-and-restrictions",
    visibility: "PUBLIC",
    author: admin,
    content: `# Booking Rules, Time Restrictions & Cancellation Policy

To ensure equitable access to institute infrastructure, all facility reservations are governed by the following rules.

---

## 1. Time Limits & Slot Restrictions

- **Minimum Booking Duration**: 15 Minutes.
- **Maximum Consecutive Standard Booking**: **3 Hours** per session.
  - *Need a full-day or multi-day booking?* (e.g. National conferences, workshops, recruitment drives): Contact the Facility POC or Registrar Office for an administrative override.
- **Advance Booking Window**: Bookings can be made up to **30 Days in advance**.
- **Minimum Notice**: Standard bookings must be made at least **2 hours** before the scheduled start time.

---

## 2. Priority Hierarchy for Slot Allocation

When multiple departments request overlapping slots for institute venues:

1. **Tier 1 (Highest Priority)**: Official Institute Convocation, Senate Meetings, Board of Governors, End-Semester Examinations.
2. **Tier 2**: Departmental National/International Conferences, AICTE/DST Workshops.
3. **Tier 3**: Regular Curriculum Lectures and Guest Seminars.
4. **Tier 4**: Student Club Activities, Hackathons, Cultural & Technical Society events.

---

## 3. Cancellation & Non-Arrival Policy

- **Advance Cancellation**: If your event is postponed or cancelled, cancel the reservation at least **4 hours in advance** via *My Bookings* so the slot is released to other faculty and students.
- **15-Minute Auto-Release Rule**: If a reserved facility is not occupied or claimed within **15 minutes** of the start time, the facility caretaker may release the hall for standby requests.

---

## 4. Care and Conduct Guidelines

- **No Outside Food/Beverages**: Eating and drinking are strictly prohibited inside the Main Auditorium and Computer Labs (bottled water permitted).
- **AV Equipment Handling**: Do not disconnect, rewire, or adjust fixed projector and amplifier cables. Request assistance from the resident AV technician via [Log Request](/logrequest).
- **Restoring Layout**: Leave podium, chairs, and whiteboards in neat order at the end of your session.`,
  });

  await page({
    sectionId: facilitiesSection.id,
    title: "Guest House Accommodation Rules",
    slug: "guest-house-booking-rules",
    visibility: "AUTHENTICATED",
    author: admin,
    content: `# Guest House Accommodation & Allotment Policy

The IIPE Guest House provides accommodation for visiting dignitaries, external examiners, guest faculty, conference delegates, and institute guests.

---

## 1. Room Categories & Tariffs

| Category | Room Type | Eligibility / Tariff |
| :--- | :--- | :--- |
| **Category A** | VIP Executive Suites | Official Institute Guests, External Selection Committee Members, Invited Keynote Speakers (Institute Hosted) |
| **Category B** | Standard AC Double Rooms | Visiting Faculty, Researchers, Parents of Students (Subject to availability) |
| **Category C** | Transit Dormitory | Student delegates attending sanctioned academic competitions |

---

## 2. Booking Procedure

1. Faculty or departments must raise the guest house request at least **3 working days** prior to arrival.
2. Enter guest details (Name, Designation, Affiliation, Arrival/Departure flight or train schedule).
3. Payment Mode: Institute account (for official guests) or Direct guest settlement at checkout.
4. Allotment confirmation is sent via email along with check-in instructions.`,
  });

  // ==========================================
  // 6. GENERAL & HOSTEL POLICIES
  // ==========================================
  await page({
    sectionId: hostel.id,
    title: "Hostel Guidelines & Code of Conduct",
    slug: "hostel-code-of-conduct",
    visibility: "PUBLIC",
    author: sanyasi,
    content: `# Hostel Guidelines & Code of Conduct

These guidelines ensure a safe, disciplined, and inclusive residential campus environment for all IIPE students.

---

## 1. General Rules
- Entry and exit timings are recorded at the security turnstiles using institute RFID smart cards.
- Night curfew: Students must be inside the hostel premises by **10:00 PM** on weekdays and **10:30 PM** on weekends unless prior night-out permission has been approved by the Warden.
- Guests and day scholars are not permitted in residential rooms past 7:00 PM.

---

## 2. Maintenance & Room Care
- Room electrical fixtures, AC, and furniture are institute property. Report any defects promptly through **Log Request → Estate / Housekeeping**.
- Keep corridors, common washrooms, and study areas clean.

---

## 3. Emergency Contacts
- **Hostel Warden (Boys)**: +91-891-2856021 (warden.boys@iipe.ac.in)
- **Hostel Warden (Girls)**: +91-891-2856022 (warden.girls@iipe.ac.in)
- **Campus Health Centre / Medical Officer**: +91-891-2856000
- **24/7 Security Control Room**: +91-891-2856100`,
  });

  await page({
    sectionId: general.id,
    title: "IT Acceptable Use Policy",
    slug: "it-acceptable-use-policy",
    visibility: "PUBLIC",
    author: admin,
    content: `# IT & Network Acceptable Use Policy

All users of IIPE computing facilities, network bandwidth, Wi-Fi, and software licenses agree to abide by this Acceptable Use Policy.

---

## 1. Individual Accountability
- User accounts and SSO passwords must never be shared with others.
- You are responsible for all network activity originating from your registered credentials and IP addresses.

---

## 2. Prohibited Activities
- Commercial use or cryptomining on institute servers and lab workstations.
- Peer-to-peer (P2P) torrent downloads or accessing copyright-infringing content over campus Wi-Fi.
- Network scanning, packet sniffing, or vulnerability probing against institute servers without written authorization from the IT Section In-Charge.
- Sending unsolicited mass emails (spam) or phishing attempts.

---

## 3. Monitoring & Security Compliance
- The IT Section maintains automated threat detection and firewall audit logs to protect campus cyber infrastructure.
- Violations may result in immediate suspension of network access, referral to the Institute Disciplinary Committee, and action under the Information Technology Act of India.`,
  });

  console.log("Successfully seeded rich Wiki Docs knowledge base!");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
