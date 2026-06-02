import eslintImportX from "eslint-plugin-import-x";
import globals from "globals";
import js from "@eslint/js";

export default [
  js.configs.recommended,
  eslintImportX.flatConfigs.recommended,
  {
    settings: {
      "import-x/extensions": [".js"],
    },
    rules: {
      "no-warning-comments": [
        "warn",
        {
          terms: ["TODO"],
        },
      ],
      "import-x/no-cycle": ["warn"],
      "no-underscore-dangle": "off",
      "no-param-reassign": ["warn"],
      "class-methods-use-this": ["warn"],
      "no-unused-vars": ["warn"],
      "no-nested-ternary": "off",
      "no-restricted-syntax": [
        "warn",
        {
          selector: "ForInStatement",
          message:
            "for..in loops iterate over the entire prototype chain, which is virtually never what you want. Use Object.{keys,values,entries}, and iterate over the resulting array.",
        },
        {
          selector: "LabeledStatement",
          message:
            "Labels are a form of GOTO; using them makes code confusing and hard to maintain and understand.",
        },
        {
          selector: "WithStatement",
          message:
            "`with` is disallowed in strict mode because it makes code impossible to predict and optimize.",
        },
      ],
      "import-x/extensions": ["warn", "always"],
      // V2-full migration guard: the *-v2-compat modules are frozen and being
      // removed stage by stage. This errors on any NEW importer. Existing
      // importers are allowlisted in the override block below and removed from
      // the allowlist as each stage clears them. See
      // docs/superpowers/plans/2026-05-31-v2-full-migration.md.
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "**/document-sheet-v2-compat.js",
                "**/actor-sheet-v2-compat.js",
                "**/item-sheet-v2-compat.js",
              ],
              message:
                "V2 compat modules are frozen (V2-full migration). Do not add new importers; use ApplicationV2 / DocumentSheetV2 / DialogV2 directly. See docs/superpowers/plans/2026-05-31-v2-full-migration.md.",
            },
          ],
        },
      ],
    },
    languageOptions: {
      parserOptions: {
        sourceType: "module",
        ecmaVersion: 2022,
      },
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
        $: "readonly",
        ActiveEffect: "readonly",
        ActiveEffectConfig: "readonly",
        Actor: "readonly",
        Actors: "readonly",
        ActorSheet: "readonly",
        AudioHelper: "readonly",
        Babele: "readonly",
        CanvasLayer: "readonly",
        Collection: "readonly",
        CombatTracker: "readonly",
        CompendiumCollection: "readonly",
        CONFIG: "readonly",
        CONST: "readonly",
        ChatMessage: "readonly",
        Combat: "readonly",
        Combatant: "readonly",
        ContextMenu: "readonly",
        Dialog: "readonly",
        DocumentSheetConfig: "readonly",
        DragDrop: "readonly",
        Draggable: "readonly",
        FilePicker: "readonly",
        Folder: "readonly",
        ForgeAPI: "readonly",
        ForgeVTT: "readonly",
        FormApplication: "readonly",
        FormDataExtended: "readonly",
        Handlebars: "readonly",
        Hooks: "readonly",
        ImagePopout: "readonly",
        Item: "readonly",
        Items: "readonly",
        ItemSheet: "readonly",
        JournalEntry: "readonly",
        JSZip: "readonly",
        JXON: "readonly",
        Macro: "readonly",
        Pause: "readonly",
        PIXI: "readonly",
        Roll: "readonly",
        Ruler: "readonly",
        Scene: "readonly",
        Tabs: "readonly",
        TextEditor: "readonly",
        Token: "readonly",
        TokenDocument: "readonly",
        canvas: "readonly",
        combat: "readonly",
        debugger: "readonly",
        document: "readonly",
        dragRuler: "readonly",
        duplicate: "readonly",
        expandObject: "readonly",
        foundry: "readonly",
        fromUuid: "readonly",
        fromUuidSync: "readonly",
        game: "readonly",
        getDocumentClass: "readonly",
        getProperty: "readonly",
        globals: "readonly",
        hasProperty: "readonly",
        isNewerVersion: "readonly",
        loadTemplates: "readonly",
        mergeObject: "readonly",
        parseUuid: "readonly",
        randomID: "readonly",
        renderTemplate: "readonly",
        setProperty: "readonly",
        ui: "readonly",
        window: "readonly",
      },
    },
  },
  {
    // V2-full migration: existing importers of the frozen *-v2-compat modules.
    // Each entry is removed as its stage clears the imports (Stages 1.8, 2.9,
    // 3.8, 4.9). When this list empties the whole guard comes out in Stage 5.
    // See docs/superpowers/plans/2026-05-31-v2-full-migration.md.
    files: [
      // Sheet importers — import their sheet-compat base; stay allowlisted
      // until their sheet stage (3.8 / 4.9) clears.
      "modules/actors/actor-sheet-ffg.js",
      "modules/items/item-sheet-ffg.js",
      // Internal compat-to-compat imports (cleared in Stages 3.8 / 4.9)
      "modules/sheets/actor-sheet-v2-compat.js",
      "modules/sheets/item-sheet-v2-compat.js",
    ],
    rules: {
      "no-restricted-imports": "off",
    },
  },
];
