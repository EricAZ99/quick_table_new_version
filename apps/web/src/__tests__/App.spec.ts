import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

import App from "../App.vue";

describe("App — bootstrap", () => {
  it("se monte sans erreur", () => {
    const wrapper = mount(App);

    expect(wrapper.text()).toContain("QuickTable");
  });
});
