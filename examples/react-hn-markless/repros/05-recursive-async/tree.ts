export interface Tree {
	readonly id: number;
	readonly name: string;
	readonly kids: readonly number[];
}
const TREE: Record<number, Tree> = {
	1: { id: 1, name: 'root', kids: [2, 3] },
	2: { id: 2, name: 'two', kids: [4] },
	3: { id: 3, name: 'three', kids: [] },
	4: { id: 4, name: 'four', kids: [] },
};
export const node = async (id: number): Promise<Tree> => TREE[id]!;
