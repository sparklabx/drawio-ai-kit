import type { DiagramTypePreset } from "./model.ts";
export declare const DIAGRAM_TYPES: {
    pipeline: {
        label: string;
        orientation: string;
        edgeCorner: "rounded";
        laneStrategy: string;
        grouping: string;
        notes: string;
    };
    hierarchy: {
        label: string;
        orientation: string;
        edgeCorner: "sharp";
        laneStrategy: string;
        grouping: string;
        notes: string;
    };
    network: {
        label: string;
        orientation: string;
        edgeCorner: "rounded";
        laneStrategy: string;
        grouping: string;
        mirrorAZ: true;
        notes: string;
    };
    hubspoke: {
        label: string;
        orientation: string;
        edgeCorner: "rounded";
        laneStrategy: string;
        grouping: string;
        notes: string;
    };
    hybrid: {
        label: string;
        orientation: string;
        edgeCorner: "rounded";
        laneStrategy: string;
        grouping: string;
        notes: string;
    };
    mesh: {
        label: string;
        orientation: string;
        edgeCorner: "rounded";
        laneStrategy: string;
        grouping: string;
        notes: string;
    };
    sequence: {
        label: string;
        orientation: string;
        edgeCorner: "rounded";
        laneStrategy: string;
        grouping: string;
        notes: string;
    };
    bpmn: {
        label: string;
        orientation: string;
        edgeCorner: "rounded";
        laneStrategy: string;
        grouping: string;
        notes: string;
    };
};
export declare function typePreset(name: string): DiagramTypePreset;
/**
 * rounded=0/1 for an edge based on type + role.
 * role: "tree"/"fanout" → always sharp corners; "flow"/default → follows the type's edgeCorner.
 */
export declare function edgeRounded(typeOrPreset: string | DiagramTypePreset, role?: string): 0 | 1;
export declare function listTypes(): ({
    label: string;
    orientation: string;
    edgeCorner: "rounded";
    laneStrategy: string;
    grouping: string;
    notes: string;
    key: string;
} | {
    label: string;
    orientation: string;
    edgeCorner: "sharp";
    laneStrategy: string;
    grouping: string;
    notes: string;
    key: string;
} | {
    label: string;
    orientation: string;
    edgeCorner: "rounded";
    laneStrategy: string;
    grouping: string;
    mirrorAZ: true;
    notes: string;
    key: string;
} | {
    label: string;
    orientation: string;
    edgeCorner: "rounded";
    laneStrategy: string;
    grouping: string;
    notes: string;
    key: string;
} | {
    label: string;
    orientation: string;
    edgeCorner: "rounded";
    laneStrategy: string;
    grouping: string;
    notes: string;
    key: string;
} | {
    label: string;
    orientation: string;
    edgeCorner: "rounded";
    laneStrategy: string;
    grouping: string;
    notes: string;
    key: string;
} | {
    label: string;
    orientation: string;
    edgeCorner: "rounded";
    laneStrategy: string;
    grouping: string;
    notes: string;
    key: string;
} | {
    label: string;
    orientation: string;
    edgeCorner: "rounded";
    laneStrategy: string;
    grouping: string;
    notes: string;
    key: string;
})[];
