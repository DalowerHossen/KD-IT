// path: components/design-system/removable-tag-demo.tsx
"use client";

import { useState, type ReactElement } from "react";

import { Button } from "@/components/ui/button";
import { Tag } from "@/components/ui/tag";

/** Interactive removable-tag demo; tags disappear and can be restored. */
export function RemovableTagDemo(): ReactElement {
  const [tags, setTags] = useState<readonly string[]>(["USD only", "English first", "Zero Trust"]);

  if (tags.length === 0) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={() => setTags(["USD only", "English first", "Zero Trust"])}
      >
        Restore tags
      </Button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {tags.map((tag) => (
        <Tag
          key={tag}
          label={tag}
          onRemove={() => setTags((current) => current.filter((entry) => entry !== tag))}
        />
      ))}
    </div>
  );
}
