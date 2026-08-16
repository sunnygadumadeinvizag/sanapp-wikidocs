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
