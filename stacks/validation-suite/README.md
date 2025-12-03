Validation Suite Stack
---------------------

Purpose: exercise schema validation, warnings-as-errors, and extra-field detection.

Classes
- record: base class with status/tags/build/metadata.
- article: inherits record; requires slug.

Instances
- article_valid: passes validation.
- article_missing_field: missing slug to trigger schema warning/error depending on flags.
- article_extra_fields: includes undeclared top-level fields to demonstrate `--warn-extra-fields`.
- article_nested_extra: includes an undeclared nested field under `metadata` to exercise recursive extra-field warnings.
- article_reset_tags: uses `$reset` on an array field to show replacement semantics during merge.

Templates
- templates/article.json.hbs: JSON dump of each object.
- templates/summary.txt.hbs: text summary generated from global.

Build
Run `./bin/terrible build terrible/stacks/validation-suite --warn-extra-fields` to see warnings; add `--warnings-as-errors` to make them fatal.
