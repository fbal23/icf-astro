import { defineConfig } from "tinacms";

const branch = process.env.TINA_BRANCH || process.env.HEAD || "main";

export default defineConfig({
  branch,
  clientId: process.env.TINA_CLIENT_ID || "",
  token: process.env.TINA_TOKEN || "",

  build: {
    outputFolder: "admin",
    publicFolder: "public",
  },

  media: {
    tina: {
      mediaRoot: "uploads",
      publicFolder: "public",
    },
  },

  schema: {
    collections: [
      // ---------- PAGES (generic) ----------
      {
        name: "page",
        label: "Sider",
        path: "content/pages",
        format: "mdx",
        fields: [
          {
            name: "title",
            label: "Titel",
            type: "string",
            required: true,
            isTitle: true,
          },
          {
            name: "description",
            label: "Meta-beskrivelse",
            type: "string",
            ui: { component: "textarea" },
          },
          {
            name: "hero_image",
            label: "Hero-billede",
            type: "image",
          },
          {
            name: "body",
            label: "Indhold",
            type: "rich-text",
            isBody: true,
          },
        ],
      },

      // ---------- NEWS ----------
      {
        name: "news",
        label: "Nyheder",
        path: "content/news",
        format: "mdx",
        fields: [
          {
            name: "title",
            label: "Titel",
            type: "string",
            required: true,
            isTitle: true,
          },
          {
            name: "date",
            label: "Dato",
            type: "datetime",
            required: true,
          },
          {
            name: "excerpt",
            label: "Uddrag",
            type: "string",
            ui: { component: "textarea" },
          },
          {
            name: "image",
            label: "Billede",
            type: "image",
          },
          {
            name: "body",
            label: "Indhold",
            type: "rich-text",
            isBody: true,
          },
        ],
      },

      // ---------- COACHES ----------
      {
        name: "coach",
        label: "Coaches",
        path: "content/coaches",
        format: "md",
        fields: [
          {
            name: "name",
            label: "Navn",
            type: "string",
            required: true,
            isTitle: true,
          },
          {
            name: "credential_level",
            label: "ICF Credential niveau",
            type: "string",
            options: [
              { value: "ACC", label: "ACC — Associate Certified Coach" },
              { value: "PCC", label: "PCC — Professional Certified Coach" },
              { value: "MCC", label: "MCC — Master Certified Coach" },
            ],
          },
          {
            name: "region",
            label: "Region",
            type: "string",
            options: [
              "Hovedstaden",
              "Sjælland",
              "Syddanmark",
              "Midtjylland",
              "Nordjylland",
            ],
          },
          {
            name: "languages",
            label: "Sprog",
            type: "string",
            list: true,
            options: [
              { value: "da", label: "Dansk" },
              { value: "en", label: "English" },
              { value: "de", label: "Deutsch" },
              { value: "sv", label: "Svenska" },
              { value: "no", label: "Norsk" },
            ],
          },
          {
            name: "specialties",
            label: "Specialer",
            type: "string",
            list: true,
            options: [
              "Executive Coaching",
              "Karriere Coaching",
              "Team Coaching",
              "Life Coaching",
              "Leadership Coaching",
              "Business Coaching",
              "Transitions Coaching",
              "Wellness Coaching",
            ],
          },
          {
            name: "coaching_approach",
            label: "Coaching-tilgang",
            type: "string",
            ui: { component: "textarea" },
          },
          {
            name: "contact_url",
            label: "Kontakt / hjemmeside",
            type: "string",
          },
          {
            name: "photo",
            label: "Foto",
            type: "image",
          },
          {
            name: "consent_public",
            label: "Samtykke til offentlig visning",
            type: "boolean",
          },
          {
            name: "body",
            label: "Om mig",
            type: "rich-text",
            isBody: true,
          },
        ],
      },

      // ---------- BOARD MEMBERS ----------
      {
        name: "boardMember",
        label: "Bestyrelse",
        path: "content/board-members",
        format: "md",
        fields: [
          {
            name: "name",
            label: "Navn",
            type: "string",
            required: true,
            isTitle: true,
          },
          {
            name: "title",
            label: "Titel / rolle",
            type: "string",
          },
          {
            name: "photo",
            label: "Foto",
            type: "image",
          },
          {
            name: "order",
            label: "Rækkefølge",
            type: "number",
          },
          {
            name: "body",
            label: "Biografi",
            type: "rich-text",
            isBody: true,
          },
        ],
      },
    ],
  },
});
