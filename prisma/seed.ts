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
    if (existing) return existing;
    return prisma.wikiSection.create({
      data: { ...args, createdById: admin.id },
    });
  }

  // ---- Section tree ----
  const itNetwork = await section({ parentId: null, slug: "itnetwork", name: "IT Network", description: "Network, VPN and Wi-Fi documentation", sortOrder: 10 });
  const vpn = await section({ parentId: itNetwork.id, slug: "vpn", name: "VPN", description: "Remote access via VPN", sortOrder: 10 });
  const wifi = await section({ parentId: itNetwork.id, slug: "wifi", name: "Wi-Fi", description: "Connecting to campus Wi-Fi", sortOrder: 20 });
  const hostel = await section({ parentId: null, slug: "hostel", name: "Hostel", description: "Hostel guidelines and facilities", sortOrder: 20 });
  const itSoftware = await section({ parentId: null, slug: "itsoftware", name: "IT Software", description: "Software installation and licensing", sortOrder: 30 });
  const general = await section({ parentId: null, slug: "general", name: "General", description: "General intranet information", sortOrder: 100 });

  async function page(args: {
    sectionId: string;
    title: string;
    slug: string;
    visibility: PageVisibility;
    content: string;
    allowedRoles?: string[];
    author: typeof admin;
  }) {
    const existing = await prisma.wikiPage.findUnique({
      where: { sectionId_slug: { sectionId: args.sectionId, slug: args.slug } },
    });
    if (existing) return existing;
    const p = await prisma.wikiPage.create({
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
    });
    const v = await prisma.wikiPageVersion.create({
      data: {
        pageId: p.id,
        version: 1,
        title: args.title,
        content: args.content,
        changeSummary: "Initial version",
        authorId: args.author.id,
        isPublished: true,
        publishedAt: p.publishedAt,
      },
    });
    await prisma.wikiPage.update({
      where: { id: p.id },
      data: { currentVersionId: v.id },
    });
    return p;
  }

  await page({
    sectionId: vpn.id,
    title: "How to set up VPN",
    slug: "how-to-setup-vpn",
    visibility: "PUBLIC",
    author: sanyasi,
    content: `# How to set up VPN

IIPE provides a VPN so staff can securely access the intranet from home.

## Requirements

- A laptop/desktop with an internet connection
- Your IIPE username and password

## Steps

1. Install the VPN client from the IT help desk (Windows, macOS, Linux).
2. Open the client and enter the server address: \`vpn.iipe.ac.in\`.
3. Sign in with your IIPE credentials.
4. You are connected once the client shows **"Connected"**.

> For help, raise a request under **IT Network → VPN** in Log Request.`,
  });

  await page({
    sectionId: wifi.id,
    title: "Connecting to IIPE Wi-Fi",
    slug: "connecting-to-iipe-wifi",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# Connecting to IIPE Wi-Fi

Select the **IIPE-WiFi** network and sign in with your IIPE credentials.

## Troubleshooting

- Forget the network and reconnect.
- If the portal does not open, try \`http://1.1.1.1/login\`.
- Contact the IT help desk for persistent issues.`,
  });

  await page({
    sectionId: hostel.id,
    title: "Hostel Guidelines",
    slug: "guidelines",
    visibility: "PUBLIC",
    author: sanyasi,
    content: `# Hostel Guidelines

## General

- Entry and exit are recorded at the hostel gate.
- Visitors must register at the reception.

## Rooms

- Rooms are allotted by the hostel office.
- Report maintenance issues to the caretaker.

## Mess

- Mess timings are displayed at each mess hall.
- Feedback can be submitted to the mess committee.`,
  });

  await page({
    sectionId: itSoftware.id,
    title: "Installing Microsoft Office",
    slug: "installing-microsoft-office",
    visibility: "RESTRICTED",
    allowedRoles: ["STAFF_TEACHING", "STAFF_NON_TEACHING"],
    author: admin,
    content: `# Installing Microsoft Office

Microsoft 365 is licensed for IIPE staff only.

## Installation

1. Go to \`portal.office.com\` and sign in with your IIPE email.
2. Choose **Install apps → Microsoft 365 apps**.
3. Run the installer and sign in when prompted.

## License type

Institute subscription — renewed annually by the IT section.`,
  });

  const facilities = await section({ parentId: null, slug: "facilities", name: "Facilities", description: "Facilities Booking documentation and AV equipment guides", sortOrder: 90 });

  await page({
    sectionId: wifi.id,
    title: "WiFi Password",
    slug: "wifi-password",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# WiFi Password

Campus Wi-Fi uses a shared password for staff and students.

## How to get the password

- Raise a request in **Log Request → IT Network → Wi-Fi**.
- Visit the IT help desk (Academic Block, Room 201).

The password is changed periodically by the IT section.

> Never share the password outside the institute.`,
  });

  await page({
    sectionId: wifi.id,
    title: "WiFi Connectivity Issues",
    slug: "wifi-connectivity-issues",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# WiFi Connectivity Issues

Troubleshoot common Wi-Fi problems step by step.

## 1. No network visible

- Toggle Wi-Fi off and on.
- Restart your laptop or phone.
- Move closer to an access point.

## 2. Connected but no internet

- Forget the network and reconnect.
- Accept the login portal when it opens.
- Try \`http://1.1.1.1/login\` if the portal does not open.

## 3. Slow or dropping connection

- Move closer to the access point or use a wired connection.
- Turn off the VPN while on campus Wi-Fi.

## Still stuck?

Raise a request under **IT Network → Wi-Fi** in Log Request — the POC will take it up.`,
  });

  await page({
    sectionId: vpn.id,
    title: "VPN Connection Issues",
    slug: "vpn-connection-issues",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# VPN Connection Issues

## Symptom: Client will not connect

- Check your internet connection first.
- Verify the server address: \`vpn.iipe.ac.in\`.
- Restart the VPN client.

## Symptom: Authentication failed

- Confirm you are using your IIPE credentials.
- Reset your password through the SSO if you are locked out.

## Symptom: Connected but no access

- Allow the VPN client through your firewall / antivirus.
- Try a different protocol (OpenVPN / WireGuard).

## Escalate

Raise a request under **IT Network → VPN** in Log Request.`,
  });

  await page({
    sectionId: vpn.id,
    title: "VPN Troubleshooting",
    slug: "vpn-troubleshooting",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# VPN Troubleshooting

## Before you start

- Use the latest client version.
- Close other VPN software.

## Checklist

1. Internet reachable? \`ping 8.8.8.8\`
2. VPN server reachable? \`ping vpn.iipe.ac.in\`
3. DNS — use the institute DNS \`10.10.0.1\`

## Common fixes

| Problem | Fix |
| --- | --- |
| Client hangs | Uninstall and reinstall |
| Error 691 | Wrong credentials — reset your password |
| Slow speed | Use a wired connection at home |

## Logs

Attach the client log file to your Log Request — it helps the POC diagnose faster.`,
  });

  await page({
    sectionId: facilities.id,
    title: "Booking AV Facilities",
    slug: "booking-av-facilities",
    visibility: "AUTHENTICATED",
    author: sanyasi,
    content: `# Booking AV Facilities

Seminar halls and classrooms with AV equipment are booked through the **Facilities Booking** app.

## Steps

1. Open Facilities Booking (My Apps → Facilities Booking).
2. Choose the building → the AV facility (e.g. Seminar Hall with projector).
3. Select date and time (minimum 15 minutes, maximum 3 hours).
4. Provide the purpose and attach any document (PDF up to 1 MB).
5. Confirm — the booking appears instantly.

## Need more than 3 hours?

Long sessions (conferences, workshops) are arranged by the facility POC — contact the admin with the requirement and they will block the slot on your behalf.

## Support

If the AV equipment is not working during your booking, raise a request in Log Request and mention the facility name.`,
  });

  await page({
    sectionId: general.id,
    title: "About the IIPE Intranet",
    slug: "about",
    visibility: "PUBLIC",
    author: admin,
    content: `# About the IIPE Intranet

Welcome to the IIPE Intranet — a single sign-on platform for all institute applications.

## Applications

- **My Apps** — everything you have access to
- **Facilities Booking** — book rooms and guest house
- **Log Request** — raise and track service requests
- **Wiki Docs** — institute documentation (this app)

## Support

For technical issues, use **Raise an issue** in any application.`,
  });

  console.log("Wiki Docs seed complete");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
