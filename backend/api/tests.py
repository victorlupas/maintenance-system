from django.test import TestCase, Client
from django.contrib.auth.models import User
from rest_framework.test import APIClient
from rest_framework import status
from api.models import MachineType, Machine, UserMachine, Alert
from ml.air_compressor_predict import predict_air_compressor
from ml.milling_predict import predict_milling
from ml.turbofan_predict import predict_turbofan
import json


class AuthenticationTests(TestCase):
    """Tests for user authentication endpoints"""
    
    def setUp(self):
        self.client = APIClient()
        self.register_url = '/api/auth/register/'
        self.login_url = '/api/auth/login/'
        
    def test_1_user_registration_success(self):
        """Test successful user registration with valid data"""
        data = {
            'username': 'testuser',
            'email': 'test@example.com',
            'password': 'TestPass123!',
            'confirm_password': 'TestPass123!'
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertIn('access', response.data)
        self.assertIn('refresh', response.data)
        self.assertTrue(User.objects.filter(username='testuser').exists())
        
    def test_2_user_registration_duplicate_username(self):
        """Test registration fails with duplicate username"""
        User.objects.create_user('existinguser', 'existing@example.com', 'password123')
        data = {
            'username': 'existinguser',
            'email': 'new@example.com',
            'password': 'TestPass123!',
            'confirm_password': 'TestPass123!'
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        
    def test_3_user_registration_password_mismatch(self):
        """Test registration fails when passwords don't match"""
        data = {
            'username': 'testuser2',
            'email': 'test2@example.com',
            'password': 'TestPass123!',
            'confirm_password': 'DifferentPass123!'
        }
        response = self.client.post(self.register_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_400_BAD_REQUEST)
        self.assertIn('Passwords do not match', str(response.data))
        
    def test_4_user_login_success(self):
        """Test successful login with valid credentials"""
        User.objects.create_user('loginuser', 'login@example.com', 'TestPass123!')
        data = {
            'username': 'loginuser',
            'password': 'TestPass123!'
        }
        response = self.client.post(self.login_url, data, format='json')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('access', response.data)


class MachineModelTests(TestCase):
    """Tests for Machine model and ID generation"""
    
    def setUp(self):
        self.machine_type_ac = MachineType.objects.create(type_id='AC', name='Air Compressor')
        self.machine_type_cnc = MachineType.objects.create(type_id='CNC', name='CNC Milling Machine')
        
    def test_5_machine_id_generation(self):
        """Test that machine IDs are auto-generated correctly"""
        machine1 = Machine.objects.create(type=self.machine_type_ac, name='Compressor 1')
        machine2 = Machine.objects.create(type=self.machine_type_ac, name='Compressor 2')
        machine3 = Machine.objects.create(type=self.machine_type_cnc, name='CNC 1')
        
        self.assertEqual(machine1.machine_id, 'AC-001')
        self.assertEqual(machine2.machine_id, 'AC-002')
        self.assertEqual(machine3.machine_id, 'CNC-001')
        
    def test_6_user_machine_relationship(self):
        """Test UserMachine many-to-many relationship"""
        user = User.objects.create_user('machineuser', 'machine@example.com', 'password123')
        machine = Machine.objects.create(type=self.machine_type_ac, name='Test Compressor')
        
        user_machine = UserMachine.objects.create(
            user=user,
            machine=machine,
            nickname='My Compressor',
            is_tracking=True
        )
        
        self.assertEqual(user_machine.user, user)
        self.assertEqual(user_machine.machine, machine)
        self.assertEqual(user_machine.nickname, 'My Compressor')


class MLPredictionTests(TestCase):
    """Tests for ML prediction functions"""
    
    def test_7_air_compressor_prediction_healthy(self):
        """Test AC prediction returns low risk for healthy values"""
        healthy_data = {
            'temperature': 95,
            'vibration': 2.0,
            'pressure': 1.5,
            'power': 3000
        }
        result = predict_air_compressor(healthy_data)
        
        self.assertIn('probFailure', result)
        self.assertIn('riskLevel', result)
        self.assertIn('confidence', result)
        self.assertLess(result['probFailure'], 0.4)
        self.assertEqual(result['riskLevel'], 'low')
        
    def test_8_air_compressor_prediction_critical(self):
        """Test AC prediction returns critical risk for faulty values"""
        faulty_data = {
            'temperature': 145,
            'vibration': 5.5,
            'pressure': 7.5,
            'power': 14000
        }
        result = predict_air_compressor(faulty_data)
        
        self.assertGreater(result['probFailure'], 0.7)
        self.assertEqual(result['riskLevel'], 'critical')
        
    def test_9_milling_prediction_structure(self):
        """Test CNC milling prediction returns correct structure"""
        data = {
            'temperature': 38,
            'vibration': 2.0,
            'pressure': 48,
            'power': 100
        }
        result = predict_milling(data)
        
        self.assertIn('probFailure', result)
        self.assertIn('riskLevel', result)
        self.assertIn('confidence', result)
        self.assertIsInstance(result['probFailure'], float)
        self.assertIn(result['riskLevel'], ['low', 'medium', 'critical'])
        
    def test_10_turbofan_prediction_structure(self):
        """Test turbofan prediction returns correct structure"""
        data = {
            'temperature': 620,
            'vibration': 2.0,
            'pressure': 28,
            'power': 0.7
        }
        result = predict_turbofan(data)
        
        self.assertIn('probFailure', result)
        self.assertIn('riskLevel', result)
        self.assertIn('confidence', result)


class APIEndpointTests(TestCase):
    """Tests for API endpoints"""
    
    def setUp(self):
        self.client = APIClient()
        self.user = User.objects.create_user('apiuser', 'api@example.com', 'TestPass123!')
        self.machine_type = MachineType.objects.create(type_id='AC', name='Air Compressor')
        
    def test_11_test_endpoint(self):
        """Test the health check endpoint"""
        response = self.client.get('/api/test/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['message'], 'Backend is running')
        
    def test_12_me_endpoint_authenticated(self):
        """Test /me endpoint returns user info when authenticated"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['username'], 'apiuser')
        self.assertEqual(response.data['email'], 'api@example.com')
        
    def test_13_me_endpoint_unauthenticated(self):
        """Test /me endpoint returns 401 when not authenticated"""
        response = self.client.get('/api/auth/me/')
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_14_machine_types_endpoint(self):
        """Test machine types endpoint returns available types"""
        self.client.force_authenticate(user=self.user)
        response = self.client.get('/api/machine-types/')
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIsInstance(response.data, list)


class AlertModelTests(TestCase):
    """Tests for Alert model"""
    
    def setUp(self):
        self.user = User.objects.create_user('alertuser', 'alert@example.com', 'password123')
        self.machine_type = MachineType.objects.create(type_id='AC', name='Air Compressor')
        self.machine = Machine.objects.create(type=self.machine_type, name='Test Machine')
        
    def test_15_alert_creation(self):
        """Test alert creation with all severity levels"""
        alert_info = Alert.objects.create(
            machine=self.machine,
            created_for=self.user,
            description='Info alert',
            severity='info'
        )
        alert_warning = Alert.objects.create(
            machine=self.machine,
            created_for=self.user,
            description='Warning alert',
            severity='warning'
        )
        alert_critical = Alert.objects.create(
            machine=self.machine,
            created_for=self.user,
            description='Critical alert',
            severity='critical'
        )
        
        self.assertEqual(Alert.objects.count(), 3)
        self.assertEqual(alert_info.severity, 'info')
        self.assertEqual(alert_warning.severity, 'warning')
        self.assertEqual(alert_critical.severity, 'critical')
        self.assertFalse(alert_critical.acknowledged)
