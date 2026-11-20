import { describe, expect, it } from 'vitest';

import { sideBarEdgeFor } from './useSideBarEdge';

// Insets and CSS viewport widths measured in the iOS 27.2 iPhone Duo and iPhone 17 simulators.
describe('sideBarEdgeFor', () => {
  it('puts the tab bar in the right strip on the iPhone Duo outer display', () => {
    expect(sideBarEdgeFor({ top: 0, right: 84, bottom: 34, left: 0 }, 466)).toBe('right');
  });

  it('puts the tab bar in the right strip on the iPhone Duo inner display in landscape', () => {
    expect(sideBarEdgeFor({ top: 0, right: 84, bottom: 34, left: 0 }, 951)).toBe('right');
  });

  it('follows the strip when it is on the left', () => {
    expect(sideBarEdgeFor({ top: 0, right: 0, bottom: 34, left: 84 }, 951)).toBe('left');
  });

  it('keeps the bottom bar on the iPhone Duo inner display in portrait', () => {
    expect(sideBarEdgeFor({ top: 82, right: 0, bottom: 34, left: 0 }, 669)).toBeNull();
  });

  it('keeps the bottom bar on a portrait iPhone', () => {
    expect(sideBarEdgeFor({ top: 62, right: 0, bottom: 34, left: 0 }, 402)).toBeNull();
  });

  it('keeps the bottom bar on a landscape iPhone, which reserves both sides', () => {
    expect(sideBarEdgeFor({ top: 0, right: 62, bottom: 21, left: 62 }, 874)).toBeNull();
  });

  it('keeps the bottom bar when there are no insets (browser, iPad)', () => {
    expect(sideBarEdgeFor({ top: 0, right: 0, bottom: 0, left: 0 }, 820)).toBeNull();
  });

  it('leaves desktop widths to the sidebar', () => {
    expect(sideBarEdgeFor({ top: 0, right: 84, bottom: 0, left: 0 }, 1024)).toBeNull();
  });

  it('ignores insets too small to be a reserved strip', () => {
    expect(sideBarEdgeFor({ top: 0, right: 8, bottom: 0, left: 0 }, 600)).toBeNull();
  });
});
