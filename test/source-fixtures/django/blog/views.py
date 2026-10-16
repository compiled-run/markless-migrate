from django.contrib.auth.decorators import login_required, permission_required
from django.contrib.auth.mixins import LoginRequiredMixin
from django.utils import timezone
from django.views.generic import CreateView, DetailView


def index(request):
    return render(request, 'index.html', {'now': timezone.now()})


class PostDetail(DetailView):
    pass


class PostCreate(LoginRequiredMixin, CreateView):
    pass


def archive(request, year):
    return render(request, 'archive.html')


@permission_required('blog.add_comment')
def comment(request):
    if request.method == 'POST':
        pass
    return render(request, 'comment.html', {'theme': request.COOKIES.get('theme')})
