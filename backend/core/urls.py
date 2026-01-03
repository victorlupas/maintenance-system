from django.contrib import admin
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from api.views import test, me, register, synthetic_data, air_compressor_prediction, milling_predict, turbofan_predict

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/test/", test),
    path("api/synthetic/", synthetic_data),

    path("api/auth/register/", register),
    path("api/auth/me/", me),

    path("api/predictions/air-compressor/", air_compressor_prediction),
    path("api/predictions/milling/", milling_predict),
    path("api/predictions/turbofan/", turbofan_predict),

    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

]
