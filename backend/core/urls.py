from django.contrib import admin
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from api.views import test, me, register
from api.views import synthetic_data

urlpatterns = [
    path("admin/", admin.site.urls),

    path("api/test/", test),

    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),
    path("api/auth/me/", me),
    path("api/auth/register/", register),
    path("api/synthetic/", synthetic_data),
]
