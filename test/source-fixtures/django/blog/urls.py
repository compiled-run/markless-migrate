from django.urls import path, re_path
from django.contrib.auth.decorators import login_required
from . import views

urlpatterns = [
    path('', views.index, name='index'),
    path('<int:pk>/', views.PostDetail.as_view(), name='detail'),
    path('new/', views.PostCreate.as_view(), name='new'),
    re_path(r'^archive/(?P<year>[0-9]{4})/$', login_required(views.archive)),
    path('comment/', views.comment),
]
