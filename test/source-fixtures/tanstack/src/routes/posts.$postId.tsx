import { createFileRoute } from '@tanstack/react-router';
import { supabase } from '../lib/supabase';

export const Route = createFileRoute('/posts/$postId')({
	component: Post,
});

function Post() {
	const like = async () => {
		await supabase.from('likes').insert({ post: 1 });
	};
	return <button onClick={like}>Like</button>;
}
