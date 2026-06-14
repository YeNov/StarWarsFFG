/* ============================================================
   App — design canvas: the winning Codex II system + companions
   ============================================================ */
const { DesignCanvas, DCSection, DCArtboard } = window;

/* Resolve a sheet component from window at render time. If its script flaked
   on load (the in-browser Babel fetch is occasionally lossy), show a small
   placeholder for just that artboard instead of crashing the whole canvas. */
function Safe({ name, ...props }) {
  const C = window[name];
  if (typeof C !== "function") {
    return (
      <div style={{ width: "100%", height: "100%", minHeight: 200, display: "flex", alignItems: "center",
        justifyContent: "center", textAlign: "center", padding: 24, background: "#1a1714", color: "#9a8e88",
        fontFamily: "monospace", fontSize: 13 }}>
        {name} didn’t load — refresh the page to retry.
      </div>
    );
  }
  return <C {...props} />;
}

function App() {
  return (
    <DesignCanvas>
      <DCSection id="character" title="Character sheet · Codex II"
        subtitle="The chosen sheet. One layout — click the Scheme switcher on the card to reskin (Republic / Empire / Dark / Light / Mercenary).">
        <DCArtboard id="cdx" label="Character — Codex II" width={1000} height={1010}>
          <Safe name="CodexSheet2" initialScheme="republic" />
        </DCArtboard>
      </DCSection>

      <DCSection id="companions" title="Companion sheets · same system"
        subtitle="Vehicle (4-zone and 2-zone defence variants), the adversary stat block, and the minion group — in the same themeable language.">
        <DCArtboard id="veh4" label="Vehicle — 4 defence zones" width={1000} height={800}>
          <Safe name="CodexVehicle" initialScheme="mercenary" zones={4} />
        </DCArtboard>
        <DCArtboard id="veh2" label="Vehicle — 2 defence zones" width={1000} height={800}>
          <Safe name="CodexVehicle" initialScheme="republic" zones={2} />
        </DCArtboard>
        <DCArtboard id="adv" label="Adversary — Nemesis stat block" width={1000} height={900}>
          <Safe name="CodexAdversary" initialScheme="empire" />
        </DCArtboard>
        <DCArtboard id="min" label="Minion group — shared pool, scaling skills" width={1000} height={940}>
          <Safe name="CodexMinion" initialScheme="empire" />
        </DCArtboard>
      </DCSection>

      <DCSection id="items" title="Item detail sheets · same system"
        subtitle="Pop-out windows — weapon, armour, gear, talent. Weapon & armour show a condition track; weapon/armour/gear give the image room. Talents carry no image.">
        <DCArtboard id="item-weapon" label="Weapon" width={540} height={560}>
          <Safe name="ItemSheet" which={0} initialScheme="dark" />
        </DCArtboard>
        <DCArtboard id="item-armour" label="Armour" width={540} height={560}>
          <Safe name="ItemSheet" which={1} initialScheme="republic" />
        </DCArtboard>
        <DCArtboard id="item-gear" label="Gear" width={540} height={500}>
          <Safe name="ItemSheet" which={2} initialScheme="mercenary" />
        </DCArtboard>
        <DCArtboard id="item-talent" label="Talent" width={540} height={430}>
          <Safe name="ItemSheet" which={3} initialScheme="light" />
        </DCArtboard>
      </DCSection>

      <DCSection id="reference" title="Other directions explored"
        subtitle="Kept for reference — the faithful original, the bold HUD, and two divergent takes.">
        <DCArtboard id="codex" label="01 · Codex — original" width={1000} height={920}>
          <Safe name="CodexSheet" />
        </DCArtboard>
        <DCArtboard id="hud2" label="03b · Faction HUD II" width={1000} height={1020}>
          <Safe name="HudSheet2" />
        </DCArtboard>
        <DCArtboard id="console" label="04 · Console — retro CRT" width={1000} height={920}>
          <Safe name="ConsoleSheet" />
        </DCArtboard>
        <DCArtboard id="dossier" label="05 · Dossier — editorial" width={1000} height={1040}>
          <Safe name="DossierSheet" />
        </DCArtboard>
      </DCSection>
    </DesignCanvas>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
