export class UserService {
	async getUser(id: string) {
		return id ? { id } : undefined;
	}
}
