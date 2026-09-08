export function registerTokenControls() {
  game.settings.register("starwarsffg", "showMinionCount", {
    name: game.i18n.localize("SWFFG.Settings.showMinionCount.Name"),
    hint: game.i18n.localize("SWFFG.Settings.showMinionCount.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
    onChange: (rule) => window.location.reload()
  });
  game.settings.register("starwarsffg", "showAdversaryCount", {
    name: game.i18n.localize("SWFFG.Settings.showAdversaryCount.Name"),
    hint: game.i18n.localize("SWFFG.Settings.showAdversaryCount.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
    onChange: (rule) => window.location.reload()
  });
    game.settings.register("starwarsffg", "adversaryItemName", {
    name: game.i18n.localize("SWFFG.Settings.AdversaryItemName.Name"),
    hint: game.i18n.localize("SWFFG.Settings.AdversaryItemName.Hint"),
    scope: "world",
    config: false,
    default: "Adversary",
    type: String,
    onChange: (rule) => window.location.reload()
  });
  game.settings.register("starwarsffg", "enableAdversaryCalc", {
    name: game.i18n.localize("SWFFG.Settings.enableAdversaryCalc.Name"),
    hint: game.i18n.localize("SWFFG.Settings.enableAdversaryCalc.Hint"),
    scope: "world",
    config: false,
    default: true,
    type: Boolean,
    onChange: (rule) => window.location.reload()
  });
}

export function drawMinionCount(token) {
  if (!game.settings.get("starwarsffg", "showMinionCount")) {
    return;
  }
  const borderWidth = 0.35;
  const friendlyColor = "0x00A2E84D";
  const enemyColor = "0x8800154D";
  const overflowColor = "0xDAA520";
  // calculate total and alive numbers of minions
  const curCount = Math.max(token.actor.system.quantity.value, 0);
  const maxCount = token.actor.system.quantity.max;
  const maxRender = 6;

  // attempt to draw it on the token directly
  // check for existing copies of the container
  if (!token.children.find(i => i.name === "minionCount")) {
    const countContainer = new PIXI.Container();
    countContainer.name = "minionCount";
    token.minionCount = token.addChild(countContainer);
  } else {
    token.minionCount.removeChildren().forEach(i => i.destroy());
  }

  const tokenWidth = token.w;
  const markerWidth = 7;
  const markerHeight = 15;
  const insideGap = 5;
  const availableSpace = tokenWidth - ((markerWidth * maxCount) + (insideGap * (maxCount - 1)));
  const outsideGap = availableSpace / 2;

  if (maxCount > maxRender) {
    const text = new PIXI.Text(
      "∞",
      {
        fontFamily: "Arial",
        fontSize: 48,
        fill: overflowColor,
        align: "center",
        stroke: "0x000000",
        strokeThickness: 1,
        fontWeight: "bold" ,
      }
    );
    text.anchor.set(0.5);
    text.x = tokenWidth / 2;
    text.y = token.h - 12;
    token.minionCount.addChild(text);
  } else {
    for (let i = 0; i < curCount; i++) {
      const element = new PIXI.Graphics();
      // add the border
      element.lineStyle(borderWidth, "0x000000", 1);
      // draw the rectangle
      element.beginFill(friendlyColor);
      element.drawRoundedRect(0, 0, markerWidth, markerHeight, 2);
      element.endFill();
      element.endFill();
      // position it
      element.x = (i * (markerWidth + insideGap)) + outsideGap;
      element.y = token.h - markerHeight - 2;
      // add it to the container
      token.minionCount.addChild(element);
    }

    for (let i = 0; i < maxCount - curCount; i++) {
      const element = new PIXI.Graphics();
      // add the border
      element.lineStyle(borderWidth, "0x000000", 1);
      // draw the rectangle
      element.beginFill(enemyColor);
      element.drawRoundedRect(0, 0, markerWidth, markerHeight, 2);
      element.endFill();
      // position it
      element.x = ((i + curCount) * (markerWidth + insideGap)) + outsideGap;
      element.y = token.h - markerHeight - 2;
      // add it to the container
      token.minionCount.addChild(element);
    }
  }
}

export function drawAdversaryCount(token) {
  if (!game.settings.get("starwarsffg", "showAdversaryCount")) {
    return;
  }
  const overflowColor = "0xDAA520";
  const itemName = game.settings.get("starwarsffg", "adversaryItemName");
  const adversaryItems = token?.actor?.items?.filter(i => i.name === itemName) || [];
  let adversaryLevel = 0;
  adversaryItems.forEach(function (item) {
    adversaryLevel += item?.system?.ranks?.current || 0;
  });
  if (adversaryLevel > 0) {
    // attempt to draw it on the token directly
    // check for existing copies of the container
    if (!token.children.find(i => i.name === "adversaryLevel")) {
      const countContainer = new PIXI.Container();
      countContainer.name = "adversaryLevel";
      token.adversaryLevel = token.addChild(countContainer);
    } else {
      token.adversaryLevel.removeChildren().forEach(i => i.destroy());
    }
    // The badge art was drawn against a 1x1 token on Foundry's default 100px grid, so a fixed
    // scale left it the same handful of pixels on every scene. token.w/token.h are the token's
    // on-canvas size -- its grid footprint multiplied by the scene's grid size -- so deriving
    // the scale from them keeps the badge proportional on coarser or finer grids and on tokens
    // larger than one square. Scaling off the smaller dimension keeps a tall or wide token from
    // stretching it, and the bottom-centre anchor keeps it pinned to the token's lower edge
    // instead of drifting towards the middle as the token grows.
    const referenceTokenSize = 100;
    const badgeScale = 0.15;
    const bottomMargin = 7;
    const tokenScale = Math.min(token.w, token.h) / referenceTokenSize;
    const sprite = PIXI.Sprite.from(`systems/starwarsffg/images/adversary/adversary-${adversaryLevel}.png`);
    sprite.anchor.set(0.5, 1);
    sprite.scale.set(badgeScale * tokenScale, badgeScale * tokenScale);
    sprite.x = token.w / 2;
    sprite.y = token.h - (bottomMargin * tokenScale);
    if (adversaryLevel > 5) {
      sprite.tint = overflowColor;
      adversaryLevel = 6;
    }
    token.adversaryLevel.addChild(sprite);
  }
}
