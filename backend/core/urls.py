from django.contrib import admin
from django.urls import path
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from api.views import *

urlpatterns = [
    path("admin/", admin.site.urls),
    path("api/test/", test),
    path("api/synthetic/", synthetic_data),
    path("api/machine-types/", get_machine_types),  # For the dropdown
    path("api/machines/add/", add_machine),  # To save user choice
    path("api/machines/<str:machine_id>/delete/", delete_machine),
    path("api/auth/register/", register),
    path("api/auth/logout/", logout),
    path("api/auth/me/", me),

    path("api/predictions/air-compressor/", air_compressor_prediction),
    path("api/predictions/milling/", milling_prediction),  # CHANGED: milling_predict -> milling_prediction
    path("api/predictions/turbofan/", turbofan_prediction),  # CHANGED: turbofan_predict -> turbofan_prediction

    path("api/auth/login/", TokenObtainPairView.as_view(), name="token_obtain_pair"),
    path("api/auth/refresh/", TokenRefreshView.as_view(), name="token_refresh"),

]