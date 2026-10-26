export interface NewsItemModel {
	readonly id: number;
	readonly commentCount: number;
	readonly comments: readonly number[];
	readonly creationTime: number;
	readonly hidden?: boolean;
	readonly hiddenCount?: number;
	readonly hides: readonly string[];
	readonly submitterId: string;
	readonly text: string | null;
	readonly title: string;
	readonly upvoteCount: number;
	readonly upvotes: readonly string[];
	readonly upvoted?: boolean;
	readonly url?: string;
}

export interface CommentModel {
	readonly id: number;
	readonly comments: readonly number[];
	readonly creationTime: number;
	readonly parent: number;
	readonly submitterId: string;
	readonly text: string;
	readonly upvotes: readonly string[];
}

export interface UserModel {
	readonly id: string;
	readonly about: string;
	readonly creationTime: number;
	readonly dateOfBirth: number | null;
	readonly email: string | null;
	readonly firstName: string | null;
	readonly hashedPassword?: string;
	readonly hides: readonly number[];
	readonly karma: number;
	readonly lastName: string | null;
	readonly likes: readonly number[];
	readonly passwordSalt?: string;
	readonly posts: readonly number[];
}
