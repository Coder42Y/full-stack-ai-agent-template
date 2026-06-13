"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useKnowledgeBases } from "@/hooks";
import type { KBScope } from "@/types";

interface CreateKBDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (id: string) => void;
}

export function CreateKBDialog({ open, onOpenChange, onCreated }: CreateKBDialogProps) {
  const [name, setName] = useState("");
  const [projectName, setProjectName] = useState("");
  const [description, setDescription] = useState("");
  const [scope, setScope] = useState<KBScope>("org");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { createKB } = useKnowledgeBases();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim()) return;
    setIsSubmitting(true);
    const kb = await createKB({
      name: name.trim() || projectName.trim(),
      project_name: projectName.trim(),
      description: description.trim() || undefined,
      scope,
    });
    setIsSubmitting(false);
    if (kb) {
      setName("");
      setProjectName("");
      setDescription("");
      setScope("org");
      onOpenChange(false);
      onCreated?.(kb.id);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>新建需求项目</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="kb-project-name">项目名称</Label>
            <Input
              id="kb-project-name"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              placeholder="海外地址支持"
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kb-name">知识库名称（可选）</Label>
            <Input
              id="kb-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="需求知识库"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kb-description">项目说明（可选）</Label>
            <Textarea
              id="kb-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="这个项目覆盖哪类需求？"
              rows={2}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="kb-scope">可见范围</Label>
            <Select value={scope} onValueChange={(v) => setScope(v as KBScope)}>
              <SelectTrigger id="kb-scope">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="org">团队范围 - 演示管理员</SelectItem>
                <SelectItem value="personal">个人范围 - 私有项目</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button type="submit" disabled={!projectName.trim() || isSubmitting}>
              {isSubmitting ? "创建中..." : "创建项目"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
