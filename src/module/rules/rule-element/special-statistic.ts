import type { CharacterPF2e } from "@actor";
import { AttributeString } from "@actor/types.ts";
import { ATTRIBUTE_ABBREVIATIONS, SAVE_TYPES, SKILL_LONG_FORMS } from "@actor/values.ts";
import { ItemSpellcasting } from "@item/spellcasting-entry/item-spellcasting.ts";
import { PredicateField, SlugField } from "@system/schema-data-fields.ts";
import { Statistic, StatisticData } from "@system/statistic/index.ts";
import { setHasElement, tupleHasValue } from "@util";
import type { StringField } from "types/foundry/common/data/fields.d.ts";
import { RuleElementPF2e } from "../index.ts";
import type { RuleElementSchema } from "./data.ts";

/** Create a special-purpose statistic for use in checks and as a DC */
class SpecialStatisticRuleElement extends RuleElementPF2e<StatisticRESchema> {
    static override defineSchema(): StatisticRESchema {
        const fields = foundry.data.fields;
        return {
            ...super.defineSchema(),
            slug: new SlugField({
                required: true,
                nullable: false,
                initial: undefined,
                validate: (v) =>
                    typeof v === "string" &&
                    !(
                        v in CONFIG.PF2E.magicTraditions ||
                        v in CONFIG.PF2E.classTraits ||
                        setHasElement(SKILL_LONG_FORMS, v) ||
                        tupleHasValue(SAVE_TYPES, v) ||
                        ["perception", "initiative"].includes(v)
                    ),
            }),
            type: new fields.StringField({
                required: true,
                choices: ["simple", "check", "attack-roll"],
                initial: "check",
            }),
            extends: new fields.StringField({ required: true, nullable: true, initial: null }),
            attribute: new fields.StringField({
                required: false,
                choices: Array.from(ATTRIBUTE_ABBREVIATIONS),
                nullable: true,
                initial: null,
            }),
            itemCasting: new PredicateField({ required: false, nullable: true, initial: null }),
        };
    }

    override afterPrepareData(): void {
        if (this.type === "simple") return;

        const checkDomains = this.type === "check" ? [`${this.slug}-check`] : [`${this.slug}-attack-roll`];
        const extendedFrom = this.extends
            ? this.actor.getStatistic(this.extends) ?? this.actor.synthetics.statistics.get(this.extends) ?? null
            : null;
        const label = this.itemCasting ? extendedFrom?.label ?? this.label : this.label;
        const data: StatisticData = {
            slug: this.slug,
            label,
            attribute: this.attribute ?? extendedFrom?.attribute ?? null,
            domains: [this.slug],
            check: { type: this.type === "check" ? "check" : "attack-roll", domains: checkDomains },
            dc: { domains: [`${this.slug}-dc`] },
        };

        const statistic = extendedFrom?.extend(data) ?? new Statistic(this.actor, data);
        if (statistic) {
            this.actor.synthetics.statistics.set(this.slug, statistic);
            if (this.itemCasting) {
                this.actor.spellcasting.set(
                    this.slug,
                    new ItemSpellcasting({
                        id: this.slug,
                        name: this.label,
                        actor: this.actor,
                        statistic,
                        castPredicate: this.itemCasting,
                    }),
                );
            }
        } else {
            this.failValidation(`Unable to find statistic ${this.extends} to extend from`);
        }
    }
}

interface SpecialStatisticRuleElement
    extends RuleElementPF2e<StatisticRESchema>,
        Omit<ModelPropsFromSchema<StatisticRESchema>, "label"> {
    slug: string;

    get actor(): CharacterPF2e;
}

type StatisticRESchema = RuleElementSchema & {
    type: StringField<StatisticType, StatisticType, true, false, true>;
    extends: StringField<string, string, true, true, true>;
    attribute: StringField<AttributeString, AttributeString, false, true, true>;
    itemCasting: PredicateField<false, true, true>;
};

type StatisticType = "simple" | "check" | "attack-roll";

export { SpecialStatisticRuleElement };
